import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@nx-react-nestjs/api-core';
import {
  // example:start
  eventually,
  // example:end
  signTestToken,
  startTestDatabase,
  startTestRedis,
  type TestDatabase,
  testEnv,
  type TestRedis,
} from '@nx-react-nestjs/api-core/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

/** Journal d'audit : écrit par les handlers d'événements, lu par le staff du tenant. */
describe('Audit log (e2e)', () => {
  let database: TestDatabase;
  let redis: TestRedis;
  let app: INestApplication;
  const tenantId = randomUUID();
  const customer = { userId: randomUUID(), tenantId, email: 'ada@example.com' };
  let staffToken: string;
  let customerToken: string;

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
    staffToken = await signTestToken({ userId: randomUUID(), tenantId, roles: ['staff'] });
    customerToken = await signTestToken(customer);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([database?.stop(), redis?.stop()]);
  });

  const api = () => request(app.getHttpServer());

  it('is reserved to the staff of the tenant', async () => {
    const forbidden = await api()
      .get('/api/v1/audit/entries')
      .auth(customerToken, { type: 'bearer' })
      .expect(403);
    expect(forbidden.body.code).toBe('FORBIDDEN');
    await api().get('/api/v1/audit/entries').expect(401);
  });

  it('starts empty for a new tenant', async () => {
    const token = await signTestToken({
      userId: randomUUID(),
      tenantId: randomUUID(),
      roles: ['staff'],
    });
    const { body } = await api()
      .get('/api/v1/audit/entries')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(body).toEqual({ items: [], nextCursor: null });
  });

  it('refuses an invalid filter', async () => {
    const { body } = await api()
      .get('/api/v1/audit/entries?action=Cancel%20order')
      .auth(staffToken, { type: 'bearer' })
      .expect(400);
    expect(body.code).toBe('VALIDATION_FAILED');
  });

  // example:start
  it('records a placed order, by its customer, and lists it for the staff', async () => {
    const product = await api()
      .post('/api/v1/catalog/products')
      .auth(staffToken, { type: 'bearer' })
      .send({ sku: 'AUDIT-TEE', name: 'Tee-shirt', price: { amountMinor: 1990, currency: 'EUR' } })
      .expect(201);
    await api()
      .post(`/api/v1/catalog/products/${product.body.id}/publish`)
      .auth(staffToken, { type: 'bearer' })
      .expect(200);
    const order = await api()
      .post('/api/v1/orders')
      .auth(customerToken, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ lines: [{ productId: product.body.id, quantity: 2 }] })
      .expect(201);

    await eventually(async () => {
      const { body } = await api()
        .get(`/api/v1/audit/entries?actorId=${customer.userId}`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
      expect(body.items).toEqual([
        expect.objectContaining({
          actorId: customer.userId,
          action: 'orders.order-placed',
          resource: { type: 'order', id: order.body.id },
          details: { totalMinor: 3980, currency: 'EUR', lines: 1 },
        }),
      ]);
      // Aucun email : il survivrait à l'effacement de la personne.
      expect(JSON.stringify(body)).not.toContain(customer.email);
    });
  });

  it('names the operator who placed an order for the customer (impersonation, ADR 0019)', async () => {
    const operatorId = randomUUID();
    const product = await api()
      .post('/api/v1/catalog/products')
      .auth(staffToken, { type: 'bearer' })
      .send({ sku: 'AUDIT-CAP', name: 'Casquette', price: { amountMinor: 1500, currency: 'EUR' } })
      .expect(201);
    await api()
      .post(`/api/v1/catalog/products/${product.body.id}/publish`)
      .auth(staffToken, { type: 'bearer' })
      .expect(200);
    const order = await api()
      .post('/api/v1/orders')
      .auth(await signTestToken({ ...customer, impersonatorId: operatorId }), { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ lines: [{ productId: product.body.id, quantity: 1 }] })
      .expect(201);

    await eventually(async () => {
      const { body } = await api()
        .get('/api/v1/audit/entries?action=orders.order-placed')
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
      expect(body.items).toContainEqual(
        expect.objectContaining({
          actorId: customer.userId,
          impersonatorId: operatorId,
          resource: { type: 'order', id: order.body.id },
        }),
      );
    });
  });
  // example:end
});
