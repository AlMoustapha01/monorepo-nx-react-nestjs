import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@nx-react-nestjs/api-core';
import {
  eventually,
  signTestToken,
  startTestDatabase,
  startTestRedis,
  type TestDatabase,
  testEnv,
  type TestRedis,
} from '@nx-react-nestjs/api-core/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('API commandes (e2e)', () => {
  let database: TestDatabase;
  let redis: TestRedis;
  let app: INestApplication;
  const customer = { userId: randomUUID(), tenantId: randomUUID() };
  const staff = { userId: randomUUID(), tenantId: customer.tenantId, roles: ['staff' as const] };
  let token: string;
  let staffToken: string;

  beforeAll(async () => {
    [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    token = await signTestToken(customer);
    staffToken = await signTestToken(staff);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([database?.stop(), redis?.stop()]);
  });

  const api = () => request(app.getHttpServer());

  /** Crée un produit dans le catalogue (rôle staff), publié par défaut. */
  async function catalogProduct(sku: string, amountMinor: number, publish = true) {
    const { body } = await api()
      .post('/api/v1/catalog/products')
      .auth(staffToken, { type: 'bearer' })
      .send({ sku, name: sku, price: { amountMinor, currency: 'EUR' } })
      .expect(201);
    if (publish) {
      await api()
        .post(`/api/v1/catalog/products/${body.id}/publish`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
    }
    return body.id as string;
  }

  const placeOrder = (lines: { productId: string; quantity: number }[], as = token) =>
    api().post('/api/v1/orders').auth(as, { type: 'bearer' }).send({ lines });

  it('passe une commande depuis le catalogue, puis l’annule', async () => {
    const tee = await catalogProduct('ORD-TEE', 1990);
    const mug = await catalogProduct('ORD-MUG', 900);

    const placed = await placeOrder([
      { productId: tee, quantity: 2 },
      { productId: mug, quantity: 1 },
    ]).expect(201);
    expect(placed.body.id).toMatch(/^ORD-[0-9a-z]{20}$/);
    expect(placed.body).toMatchObject({
      customerId: customer.userId,
      status: 'placed',
      total: { amountMinor: 1990 * 2 + 900, currency: 'EUR' },
      lines: [
        { sku: 'ORD-TEE', quantity: 2, subtotal: { amountMinor: 3980, currency: 'EUR' } },
        { sku: 'ORD-MUG', quantity: 1, subtotal: { amountMinor: 900, currency: 'EUR' } },
      ],
    });

    await api()
      .post(`/api/v1/orders/${placed.body.id}/cancel`)
      .auth(token, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('cancelled'));
  });

  it('met à jour les ventes du catalogue de façon asynchrone, annulation comprise', async () => {
    const tee = await catalogProduct('ORD-SOLD', 1000);
    const soldCount = async () =>
      (
        await api()
          .get(`/api/v1/catalog/products/${tee}`)
          .auth(token, { type: 'bearer' })
          .expect(200)
      ).body.soldCount;

    const { body } = await placeOrder([{ productId: tee, quantity: 2 }]).expect(201);
    await placeOrder([{ productId: tee, quantity: 3 }]).expect(201);
    await eventually(async () => expect(await soldCount()).toBe(5));

    // Annuler deux fois ne retire les ventes qu'une fois : 5 - 2, et non 5 - 4.
    const cancel = () =>
      api().post(`/api/v1/orders/${body.id}/cancel`).auth(token, { type: 'bearer' }).expect(200);
    await cancel();
    await cancel();
    await eventually(async () => expect(await soldCount()).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await soldCount()).toBe(3);
  });

  it('fige le prix payé malgré un changement au catalogue', async () => {
    const tee = await catalogProduct('ORD-FROZEN', 1000);
    const { body } = await placeOrder([{ productId: tee, quantity: 1 }]).expect(201);

    await api()
      .patch(`/api/v1/catalog/products/${tee}/price`)
      .auth(staffToken, { type: 'bearer' })
      .send({ price: { amountMinor: 5000, currency: 'EUR' } })
      .expect(200);

    await api()
      .get(`/api/v1/orders/${body.id}`)
      .auth(token, { type: 'bearer' })
      .expect(200)
      .expect(({ body: order }) => expect(order.total.amountMinor).toBe(1000));
  });

  it('renvoie 422 pour un produit non publié ou d’un autre tenant', async () => {
    const draft = await catalogProduct('ORD-DRAFT', 1000, false);
    await placeOrder([{ productId: draft, quantity: 1 }])
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('PRODUCT_UNAVAILABLE'));

    const tee = await catalogProduct('ORD-OTHER', 1000);
    const outsider = await signTestToken({ userId: randomUUID(), tenantId: randomUUID() });
    await placeOrder([{ productId: tee, quantity: 1 }], outsider)
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('PRODUCT_UNAVAILABLE'));
  });

  it('valide la requête et isole les commandes par tenant', async () => {
    await placeOrder([])
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('VALIDATION_FAILED'));

    const tee = await catalogProduct('ORD-PRIVATE', 1000);
    const { body } = await placeOrder([{ productId: tee, quantity: 1 }]).expect(201);
    const outsider = await signTestToken({ userId: randomUUID(), tenantId: randomUUID() });
    await api()
      .get(`/api/v1/orders/${body.id}`)
      .auth(outsider, { type: 'bearer' })
      .expect(404)
      .expect(({ body: problem }) => expect(problem.code).toBe('ORDER_NOT_FOUND'));
  });

  it('un client ne voit que ses commandes ; le staff voit celles de tout le tenant', async () => {
    const tee = await catalogProduct('ORD-OWNER', 1000);
    const { body } = await placeOrder([{ productId: tee, quantity: 1 }]).expect(201);
    const neighbour = await signTestToken({ userId: randomUUID(), tenantId: customer.tenantId });

    await api()
      .get(`/api/v1/orders/${body.id}`)
      .auth(neighbour, { type: 'bearer' })
      .expect(404)
      .expect(({ body: problem }) => expect(problem.code).toBe('ORDER_NOT_FOUND'));
    await api()
      .post(`/api/v1/orders/${body.id}/cancel`)
      .auth(neighbour, { type: 'bearer' })
      .expect(404);
    await api()
      .get('/api/v1/orders')
      .auth(neighbour, { type: 'bearer' })
      .expect(200)
      .expect(({ body: page }) => expect(page.items).toEqual([]));

    await api().get(`/api/v1/orders/${body.id}`).auth(staffToken, { type: 'bearer' }).expect(200);
  });
});
