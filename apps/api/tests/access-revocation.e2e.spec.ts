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
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

/** Le service d'identité inscrit une révocation (ADR 0016) : l'API refuse aussitôt les tokens émis avant. */
describe('Access revocation (e2e)', () => {
  let database: TestDatabase;
  let redis: TestRedis;
  let app: INestApplication;

  beforeAll(async () => {
    [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }));
    // option:feature-flags:start
    process.env['FEATURE_FLAGS'] = 'audit.log=true';
    // option:feature-flags:end
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([database?.stop(), redis?.stop()]);
  });

  /** Comme `apps/auth` : rôle `app`, sans tenant posé sur la connexion. */
  async function revoke(tenantId: string, userId: string, revokedAt: Date): Promise<void> {
    const client = new Client({ connectionString: database.url });
    await client.connect();
    try {
      await client.query(
        'insert into access.revocations (tenant_id, user_id, revoked_at) values ($1, $2, $3)',
        [tenantId, userId, revokedAt],
      );
    } finally {
      await client.end();
    }
  }

  const list = (token: string) =>
    request(app.getHttpServer()).get('/api/v1/audit/entries').auth(token, { type: 'bearer' });

  it('refuses at once a token issued before its user lost access to the tenant', async () => {
    const staff = { userId: randomUUID(), tenantId: randomUUID(), roles: ['staff' as const] };
    const token = await signTestToken(staff);
    await list(token).expect(200);

    await revoke(staff.tenantId, staff.userId, new Date(Date.now() + 2_000));

    const { body } = await list(token).expect(401);
    expect(body.code).toBe('UNAUTHENTICATED');
    // Ses accès dans un autre tenant ne changent pas.
    await list(await signTestToken({ ...staff, tenantId: randomUUID() })).expect(200);
  });

  it('accepts a token issued after the revocation, with the rights of that moment', async () => {
    const staff = { userId: randomUUID(), tenantId: randomUUID(), roles: ['staff' as const] };
    await revoke(staff.tenantId, staff.userId, new Date(Date.now() - 60_000));

    const { body } = await list(await signTestToken(staff)).expect(200);
    expect(body).toEqual({ items: [], nextCursor: null });
  });
});
