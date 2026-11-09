import { randomUUID } from 'node:crypto';
import { Controller, Get, type INestApplication } from '@nestjs/common';
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

/** Route de test, authentifiée : le test ne dépend d'aucun domaine ni d'aucune option. */
@Controller({ path: 'rate-limit-probe', version: '1' })
class ProbeController {
  @Get()
  probe(): { ok: true } {
    return { ok: true };
  }
}

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
      const moduleRef = await Test.createTestingModule({
        imports: [AppModule],
        controllers: [ProbeController],
      }).compile();
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

  const call = (instance: number, token: string) =>
    request(apps[instance]?.getHttpServer())
      .get('/api/v1/rate-limit-probe')
      .auth(token, { type: 'bearer' });

  it('responds 429 beyond the limit, across all instances', async () => {
    const token = await signTestToken({ userId: randomUUID(), tenantId: randomUUID() });
    await call(0, token).expect(200);
    await call(1, token).expect(200);
    const last = await call(0, token).expect(200);
    expect(last.headers['x-ratelimit-remaining']).toBe('0');

    const blocked = await call(1, token).expect(429);
    expect(blocked.headers['content-type']).toContain('application/problem+json');
    expect(blocked.body).toMatchObject({ status: 429, code: 'TOO_MANY_REQUESTS' });
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('gives each user their own counter, even behind the same IP', async () => {
    const tenantId = randomUUID();
    const busy = await signTestToken({ userId: randomUUID(), tenantId });
    for (let i = 0; i < 3; i++) {
      await call(0, busy).expect(200);
    }
    await call(0, busy).expect(429);

    const colleague = await signTestToken({ userId: randomUUID(), tenantId });
    const response = await call(0, colleague).expect(200);
    expect(response.headers['x-ratelimit-remaining']).toBe('2');
  });
});
