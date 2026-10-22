import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

  it('expose au front les flags client avec leur valeur, pas les flags internes', async () => {
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

  it('exige un token', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/feature-flags').expect(401);
    expect(body).toMatchObject({ status: 401 });
  });
});
