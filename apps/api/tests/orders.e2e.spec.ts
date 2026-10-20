import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp } from '@nx-react-nestjs/api-core';
import {
  signTestToken,
  startTestDatabase,
  type TestDatabase,
  testEnv,
} from '@nx-react-nestjs/api-core/testing';
import request from 'supertest';
import { AppModule } from '../src/app/app.module';

describe('API commandes (e2e)', () => {
  let database: TestDatabase;
  let app: INestApplication;
  const customer = { userId: randomUUID(), tenantId: randomUUID() };
  let token: string;

  beforeAll(async () => {
    database = await startTestDatabase();
    Object.assign(process.env, testEnv(database.url));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    token = await signTestToken(customer);
  });

  afterAll(async () => {
    await app?.close();
    await database?.stop();
  });

  const api = () => request(app.getHttpServer());

  /** Crée un produit dans le catalogue, publié par défaut. */
  async function catalogProduct(sku: string, amountMinor: number, publish = true) {
    const { body } = await api()
      .post('/api/v1/catalog/products')
      .auth(token, { type: 'bearer' })
      .send({ sku, name: sku, price: { amountMinor, currency: 'EUR' } })
      .expect(201);
    if (publish) {
      await api()
        .post(`/api/v1/catalog/products/${body.id}/publish`)
        .auth(token, { type: 'bearer' })
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

  it('fige le prix payé malgré un changement au catalogue', async () => {
    const tee = await catalogProduct('ORD-FROZEN', 1000);
    const { body } = await placeOrder([{ productId: tee, quantity: 1 }]).expect(201);

    await api()
      .patch(`/api/v1/catalog/products/${tee}/price`)
      .auth(token, { type: 'bearer' })
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
});
