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
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

/** Deux instances de l'API sur le même Redis : la limite vaut pour l'ensemble, par utilisateur. */
describe('Rate limiting (e2e)', () => {
  let database: TestDatabase;
  let redis: TestRedis;
  const apps: INestApplication[] = [];

  beforeAll(async () => {
    [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }), {
      RATE_LIMIT_MAX: '3',
      JOBS_ENABLED: 'false',
    });
    for (let i = 0; i < 2; i++) {
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
      const app = moduleRef.createNestApplication({ bufferLogs: true });
      configureApp(app);
      await app.init();
      apps.push(app);
    }
  });

  afterAll(async () => {
    await Promise.all(apps.map((app) => app.close()));
    await Promise.all([database?.stop(), redis?.stop()]);
  });

  const listProducts = (instance: number, token: string) =>
    request(apps[instance]?.getHttpServer())
      .get('/api/v1/catalog/products')
      .auth(token, { type: 'bearer' });

  it('répond 429 au-delà de la limite, toutes instances confondues', async () => {
    const token = await signTestToken({ userId: randomUUID(), tenantId: randomUUID() });
    await listProducts(0, token).expect(200);
    await listProducts(1, token).expect(200);
    const last = await listProducts(0, token).expect(200);
    expect(last.headers['x-ratelimit-remaining']).toBe('0');

    const blocked = await listProducts(1, token).expect(429);
    expect(blocked.headers['content-type']).toContain('application/problem+json');
    expect(blocked.body).toMatchObject({ status: 429, code: 'TOO_MANY_REQUESTS' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('donne un compteur à chaque utilisateur, même derrière la même IP', async () => {
    const tenantId = randomUUID();
    const busy = await signTestToken({ userId: randomUUID(), tenantId });
    for (let i = 0; i < 3; i++) {
      await listProducts(0, busy).expect(200);
    }
    await listProducts(0, busy).expect(429);

    const colleague = await signTestToken({ userId: randomUUID(), tenantId });
    const response = await listProducts(0, colleague).expect(200);
    expect(response.headers['x-ratelimit-remaining']).toBe('2');
  });
});
