import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import type { FeatureFlag } from '@nx-react-nestjs/contracts';
import { ClsService } from 'nestjs-cls';
import { startTestDatabase, type TestDatabase } from '../../testing';
import { AppConfig } from '../config/app-config';
import { validateEnv } from '../config/env';
import { RequestContext } from '../context/request-context';
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
  /** Surcharge écrite comme le fait le back-office (service d'identité, ADR 0020). */
  const override = (tenantId: string, flag: string, enabled: boolean) =>
    database.adminDb
      .insert(tenantFeatureFlags)
      .values({ tenantId, flag, enabled, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: [tenantFeatureFlags.tenantId, tenantFeatureFlags.flag],
        set: { enabled, updatedAt: new Date() },
      });

  beforeAll(async () => {
    database = await startTestDatabase();
  });

  afterAll(() => database?.stop());

  it("applies a tenant's override over the catalog default and FEATURE_FLAGS", async () => {
    const pilot = newTenant();
    const excluded = newTenant();
    await override(pilot.tenantId, 'test.off', true);
    await override(excluded.tenantId, 'test.on', false);
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
    await override(pilot.tenantId, 'test.off', true);

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
      await override(tenant.tenantId, 'test.off', true);
      expect(await flags.isEnabled(OFF)).toBe(false);
    });
    await context.runAs(tenant, async () => {
      expect(await flags.isEnabled(OFF)).toBe(true);
    });
  });

  it('reads the overrides again after a failed read in the same request', async () => {
    const tenant = newTenant();
    await override(tenant.tenantId, 'test.off', true);
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
  });
});
