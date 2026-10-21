import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { configureApp, FeatureFlags } from '@nx-react-nestjs/api-core';
import {
  eventually,
  signTestToken,
  startTestDatabase,
  StaticFeatureFlags,
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
  const flags = new StaticFeatureFlags();

  beforeAll(async () => {
    [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(FeatureFlags)
      .useValue(flags)
      .compile();
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

  afterEach(() => flags.reset());

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

  const placeOrder = (
    lines: { productId: string; quantity: number }[],
    as = token,
    idempotencyKey: string = randomUUID(),
  ) =>
    api()
      .post('/api/v1/orders')
      .auth(as, { type: 'bearer' })
      .set('Idempotency-Key', idempotencyKey)
      .send({ lines });

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

  describe('Idempotency-Key', () => {
    /** Un client neuf par test : sa liste de commandes ne contient que ce que le test a créé. */
    const freshCustomer = () =>
      signTestToken({ userId: randomUUID(), tenantId: customer.tenantId });
    const myOrders = async (as: string) =>
      (await api().get('/api/v1/orders').auth(as, { type: 'bearer' }).expect(200)).body.items;

    it('refuse une commande sans clé', async () => {
      const tee = await catalogProduct('IDEM-NOKEY', 1000);
      await api()
        .post('/api/v1/orders')
        .auth(token, { type: 'bearer' })
        .send({ lines: [{ productId: tee, quantity: 1 }] })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('IDEMPOTENCY_KEY_REQUIRED'));
    });

    it('rejoue la réponse d’origine sans créer de seconde commande', async () => {
      const tee = await catalogProduct('IDEM-REPLAY', 1000);
      const buyer = await freshCustomer();
      const key = randomUUID();

      const first = await placeOrder([{ productId: tee, quantity: 1 }], buyer, key).expect(201);
      const retry = await placeOrder([{ productId: tee, quantity: 1 }], buyer, key).expect(201);

      expect(retry.body).toEqual(first.body);
      expect(first.headers['idempotent-replayed']).toBeUndefined();
      expect(retry.headers['idempotent-replayed']).toBe('true');
      expect(await myOrders(buyer)).toHaveLength(1);
    });

    it('traite une seule fois des requêtes simultanées avec la même clé', async () => {
      const tee = await catalogProduct('IDEM-RACE', 1000);
      const buyer = await freshCustomer();
      const key = randomUUID();

      const responses = await Promise.all(
        [1, 2, 3].map(() => placeOrder([{ productId: tee, quantity: 1 }], buyer, key)),
      );

      expect(responses.map((response) => response.status)).toEqual([201, 201, 201]);
      expect(new Set(responses.map((response) => response.body.id)).size).toBe(1);
      expect(await myOrders(buyer)).toHaveLength(1);
    });

    it('refuse la même clé pour une requête différente, en 422', async () => {
      const tee = await catalogProduct('IDEM-REUSE', 1000);
      const buyer = await freshCustomer();
      const key = randomUUID();

      await placeOrder([{ productId: tee, quantity: 1 }], buyer, key).expect(201);
      await placeOrder([{ productId: tee, quantity: 2 }], buyer, key)
        .expect(422)
        .expect(({ body }) => expect(body.code).toBe('IDEMPOTENCY_KEY_REUSED'));
    });

    it('ne réserve pas la clé quand la requête échoue', async () => {
      const draft = await catalogProduct('IDEM-LATER', 1000, false);
      const buyer = await freshCustomer();
      const key = randomUUID();

      await placeOrder([{ productId: draft, quantity: 1 }], buyer, key).expect(422);
      await api()
        .post(`/api/v1/catalog/products/${draft}/publish`)
        .auth(staffToken, { type: 'bearer' })
        .expect(200);
      const retried = await placeOrder([{ productId: draft, quantity: 1 }], buyer, key).expect(201);
      expect(retried.headers['idempotent-replayed']).toBeUndefined();
      expect(await myOrders(buyer)).toHaveLength(1);
    });

    it('isole les clés par utilisateur', async () => {
      const tee = await catalogProduct('IDEM-USERS', 1000);
      const [alice, bob] = await Promise.all([freshCustomer(), freshCustomer()]);
      const key = randomUUID();

      const forAlice = await placeOrder([{ productId: tee, quantity: 1 }], alice, key).expect(201);
      const forBob = await placeOrder([{ productId: tee, quantity: 1 }], bob, key).expect(201);
      expect(forBob.body.id).not.toBe(forAlice.body.id);
    });

    it('refuse une clé mal formée', async () => {
      const tee = await catalogProduct('IDEM-BADKEY', 1000);
      await placeOrder([{ productId: tee, quantity: 1 }], token, 'clé avec espaces')
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('INVALID_IDEMPOTENCY_KEY'));
    });
  });

  it('des annulations simultanées ne retirent les ventes qu’une fois', async () => {
    const tee = await catalogProduct('ORD-RACE-CANCEL', 1000);
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

    const statuses = (
      await Promise.all(
        [1, 2, 3, 4].map(() =>
          api().post(`/api/v1/orders/${body.id}/cancel`).auth(token, { type: 'bearer' }),
        ),
      )
    ).map((response) => response.status);

    // Au moins une annulation passe ; les perdantes de la course reçoivent 409 (ou 200 si elles
    // relisent après coup une commande déjà annulée). Dans tous les cas, un seul OrderCancelled.
    expect(statuses).toContain(200);
    expect(statuses.every((status) => status === 200 || status === 409)).toBe(true);
    await eventually(async () => expect(await soldCount()).toBe(3));
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(await soldCount()).toBe(3);
  });

  describe('feature flags', () => {
    it('expose au front les flags client, pas les flags internes', async () => {
      flags.set('orders.cancellation', false);
      const { body } = await api()
        .get('/api/v1/feature-flags')
        .auth(token, { type: 'bearer' })
        .expect(200);
      expect(body).toEqual({ flags: { 'orders.cancellation': false, storefront: false } });
    });

    it('masque l’annulation quand son flag est désactivé, même pour le staff', async () => {
      const tee = await catalogProduct('ORD-FLAG', 1000);
      const { body: order } = await placeOrder([{ productId: tee, quantity: 1 }]).expect(201);

      flags.set('orders.cancellation', false);
      const { body } = await api()
        .post(`/api/v1/orders/${order.id}/cancel`)
        .auth(staffToken, { type: 'bearer' })
        .expect(404);
      expect(body).toMatchObject({ code: 'FEATURE_DISABLED' });

      flags.reset();
      await api()
        .post(`/api/v1/orders/${order.id}/cancel`)
        .auth(token, { type: 'bearer' })
        .expect(200);
    });
  });
});
