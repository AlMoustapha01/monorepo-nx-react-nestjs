import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { configureApp } from '@nx-react-nestjs/api-core';
import {
  signTestToken,
  startTestDatabase,
  startTestRedis,
  type TestDatabase,
  testEnv,
  type TestRedis,
} from '@nx-react-nestjs/api-core/testing';
import { FEATURE_FLAGS, type FeatureFlagDefinition } from '@nx-react-nestjs/contracts';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

/** Indépendant du catalogue du projet : l'attendu se déduit de FEATURE_FLAGS, vide ou non. */
describe('API feature flags (e2e)', () => {
  let database: TestDatabase;
  let redis: TestRedis;
  let app: INestApplication;

  beforeAll(async () => {
    [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }), {
      JOBS_ENABLED: 'false',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([database?.stop(), redis?.stop()]);
  });

  it('exposes client flags with their value to the front end, not internal flags', async () => {
    const token = await signTestToken({ userId: randomUUID(), tenantId: randomUUID() });
    const { body } = await request(app.getHttpServer())
      .get('/api/v1/feature-flags')
      .auth(token, { type: 'bearer' })
      .expect(200);

    const expected = Object.fromEntries(
      (Object.entries(FEATURE_FLAGS) as [string, FeatureFlagDefinition][])
        .filter(([, definition]) => definition.client)
        .map(([flag, definition]) => [flag, definition.default]),
    );
    expect(body).toEqual({ flags: expected });
  });

  // Sans flag client dans le catalogue du projet, il n'y a rien à surcharger.
  const clientFlag = (Object.entries(FEATURE_FLAGS) as [string, FeatureFlagDefinition][]).find(
    ([, definition]) => definition.client,
  );

  it("applies a tenant's override to this tenant only", async ({ skip }) => {
    if (!clientFlag) return skip('no client flag in the catalog');
    const [flag, definition] = clientFlag;
    const pilot = randomUUID();
    const overridden = !definition.default;
    // Écrite comme le fait le back-office (service d'identité, ADR 0020).
    await database.adminDb.execute(
      sql`insert into feature_flags.tenant_overrides (tenant_id, flag, enabled, updated_at)
          values (${pilot}, ${flag}, ${overridden}, now())`,
    );

    const valueFor = async (tenantId: string) => {
      const token = await signTestToken({ userId: randomUUID(), tenantId });
      const { body } = await request(app.getHttpServer())
        .get('/api/v1/feature-flags')
        .auth(token, { type: 'bearer' })
        .expect(200);
      return (body as { flags: Record<string, boolean> }).flags[flag];
    };
    expect(await valueFor(pilot)).toBe(overridden);
    expect(await valueFor(randomUUID())).toBe(definition.default);

    await database.adminDb.execute(
      sql`delete from feature_flags.tenant_overrides where tenant_id = ${pilot}`,
    );
    expect(await valueFor(pilot)).toBe(definition.default);
  });

  it('requires a token', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/feature-flags').expect(401);
    expect(body).toMatchObject({ status: 401 });
  });
});
