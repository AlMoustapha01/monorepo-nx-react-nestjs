import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FeatureFlag } from '@nx-react-nestjs/contracts';
import { ClsService } from 'nestjs-cls';
import { startTestDatabase, type TestDatabase } from '../../testing';
import { AppConfig } from '../config/app-config';
import { validateEnv } from '../config/env';
import { RequestContext } from '../context/request-context';
import { runFeatureFlagsCommand } from './feature-flags-admin';
import { TenantFeatureFlags } from './tenant-feature-flags';
import { tenantFeatureFlags } from './tenant-feature-flags.schema';

// Catalogue de test : le mécanisme se teste sans dépendre des flags du projet (catalogue vide possible).
vi.mock('@nx-react-nestjs/contracts', async (importOriginal) => {
  const { z } = await import('zod');
  const actual = await importOriginal<typeof import('@nx-react-nestjs/contracts')>();
  const FEATURE_FLAGS = {
    'test.on': { description: 'Activé par défaut.', default: true, client: true },
    'test.off': { description: 'Coupé par défaut.', default: false, client: false },
  };
  return {
    ...actual,
    FEATURE_FLAGS,
    featureFlagDefinition: (flag: keyof typeof FEATURE_FLAGS) => FEATURE_FLAGS[flag],
    isFeatureFlag: (name: string) => Object.hasOwn(FEATURE_FLAGS, name),
    featureFlagSchema: z.enum(['test.on', 'test.off']),
  };
});

const ON = 'test.on' as unknown as FeatureFlag;
const OFF = 'test.off' as unknown as FeatureFlag;

describe('TenantFeatureFlags (real Postgres)', () => {
  const cls = new ClsService(new AsyncLocalStorage());
  const context = new RequestContext(cls);
  let database: TestDatabase;

  const newTenant = () => ({ userId: randomUUID(), tenantId: randomUUID() });
  const flagsWith = (FEATURE_FLAGS?: string, session = database.session(context)) =>
    new TenantFeatureFlags(
      new AppConfig(
        validateEnv({
          DATABASE_URL: database.url,
          REDIS_URL: 'redis://localhost:6379',
          AUTH_JWT_SECRET: 'x'.repeat(32),
          AUTH_JWT_ISSUER: 'issuer',
          AUTH_JWT_AUDIENCE: 'api',
          FEATURE_FLAGS,
        }),
      ),
      session,
      context,
      cls,
    );
  const command = (...args: string[]) => runFeatureFlagsCommand(database.adminDb, args);

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(() => database?.stop());

  it("applies a tenant's override over the catalog default and FEATURE_FLAGS", async () => {
    const pilot = newTenant();
    const excluded = newTenant();
    await command('set', 'test.off', pilot.tenantId, 'on');
    await command('set', 'test.on', excluded.tenantId, 'off');
    const flags = flagsWith('test.on=true');

    await context.runAs(pilot, async () => {
      expect(await flags.isEnabled(OFF)).toBe(true);
      expect(await flags.isEnabled(ON)).toBe(true);
    });
    await context.runAs(excluded, async () => {
      expect(await flags.isEnabled(ON)).toBe(false);
    });
  });

  it('keeps FEATURE_FLAGS, then the catalog default, for the other tenants', async () => {
    const pilot = newTenant();
    await command('set', 'test.off', pilot.tenantId, 'on');

    await context.runAs(newTenant(), async () => {
      expect(await flagsWith().isEnabled(OFF)).toBe(false);
      expect(await flagsWith('test.off=true').isEnabled(OFF)).toBe(true);
    });
  });

  it('uses FEATURE_FLAGS and the catalog default outside a tenant context', async () => {
    await expect(flagsWith('test.off=true').isEnabled(OFF)).resolves.toBe(true);
    await expect(flagsWith().isEnabled(ON)).resolves.toBe(true);
  });

  it('reads the overrides of a tenant once per request; the next request sees a change', async () => {
    const tenant = newTenant();
    const flags = flagsWith();

    await context.runAs(tenant, async () => {
      expect(await flags.isEnabled(OFF)).toBe(false);
      await command('set', 'test.off', tenant.tenantId, 'on');
      expect(await flags.isEnabled(OFF)).toBe(false);
    });
    await context.runAs(tenant, async () => {
      expect(await flags.isEnabled(OFF)).toBe(true);
    });
  });

  it('reads the overrides again after a failed read in the same request', async () => {
    const tenant = newTenant();
    await command('set', 'test.off', tenant.tenantId, 'on');
    let failures = 1;
    const failingOnce = new Proxy(database.session(context), {
      get: (target, key, receiver) => {
        if (key === 'db' && failures-- > 0) throw new Error('connection lost');
        return Reflect.get(target, key, receiver);
      },
    });
    const flags = flagsWith(undefined, failingOnce);

    await context.runAs(tenant, async () => {
      await expect(flags.isEnabled(OFF)).rejects.toThrow('connection lost');
      expect(await flags.isEnabled(OFF)).toBe(true);
    });
  });

  it('ignores the override of a flag removed from the catalog', async () => {
    const tenant = newTenant();
    await database.adminDb.insert(tenantFeatureFlags).values({
      tenantId: tenant.tenantId,
      flag: 'test.removed',
      enabled: true,
      updatedAt: new Date(),
    });

    await context.runAs(tenant, async () => {
      expect(await flagsWith().isEnabled(ON)).toBe(true);
    });
    expect((await command('list', tenant.tenantId)).output).toContain('test.removed  on');
    expect((await command('list', tenant.tenantId)).output).toContain('not in the catalog');
  });

  describe('feature-flags command', () => {
    it('sets, lists and clears an override', async () => {
      const tenant = newTenant();

      expect(await command('set', 'test.off', tenant.tenantId, 'on')).toMatchObject({ ok: true });
      expect(await command('set', 'test.off', tenant.tenantId, 'off')).toMatchObject({ ok: true });
      const listed = await command('list', tenant.tenantId);
      expect(listed.ok).toBe(true);
      expect(listed.output).toMatch(new RegExp(`^${tenant.tenantId}  test\\.off  off  `));

      expect(await command('clear', 'test.off', tenant.tenantId)).toMatchObject({
        ok: true,
        output: expect.stringContaining('no longer has an override'),
      });
      expect(await command('list', tenant.tenantId)).toEqual({
        ok: true,
        output: 'No tenant override.',
      });
    });

    it('refuses an unknown flag, an invalid tenant id, an invalid value or an unknown command', async () => {
      const tenantId = randomUUID();
      const refusals = await Promise.all([
        command('set', 'test.unknown', tenantId, 'on'),
        command('set', 'test.on', 'not-a-uuid', 'on'),
        command('set', 'test.on', tenantId, 'yes'),
        command('enable', 'test.on', tenantId),
        command(),
      ]);

      expect(refusals.map((result) => result.ok)).toEqual([false, false, false, false, false]);
      expect(refusals[0]?.output).toContain(
        'Unknown flag: test.unknown (catalog: test.on, test.off)',
      );
      expect(refusals[1]?.output).toContain('Invalid tenant id');
      expect(refusals[2]?.output).toContain('Invalid value');
      expect(refusals.every((result) => result.output.includes('Usage:'))).toBe(true);
      expect(await command('list', tenantId)).toMatchObject({ output: 'No tenant override.' });
    });

    it('clears the override of a flag removed from the catalog', async () => {
      const tenant = newTenant();
      await database.adminDb.insert(tenantFeatureFlags).values({
        tenantId: tenant.tenantId,
        flag: 'test.gone',
        enabled: true,
        updatedAt: new Date(),
      });

      expect(await command('clear', 'test.gone', tenant.tenantId)).toMatchObject({ ok: true });
      expect(await command('list', tenant.tenantId)).toMatchObject({
        output: 'No tenant override.',
      });
    });
  });
});
