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

describe('API catalogue (e2e)', () => {
  let database: TestDatabase;
  let redis: TestRedis;
  let app: INestApplication;
  let tokenA: string;
  let tokenB: string;
  let customerTokenA: string;

  beforeAll(async () => {
    [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }));

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();

    // Les tokens A et B gèrent le catalogue (staff) ; le client A est dans le même tenant que A.
    const tenantA = randomUUID();
    tokenA = await signTestToken({ userId: randomUUID(), tenantId: tenantA, roles: ['staff'] });
    tokenB = await signTestToken({
      userId: randomUUID(),
      tenantId: randomUUID(),
      roles: ['staff'],
    });
    customerTokenA = await signTestToken({ userId: randomUUID(), tenantId: tenantA });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([database?.stop(), redis?.stop()]);
  });

  const api = () => request(app.getHttpServer());
  const createProduct = (token: string, sku: string) =>
    api()
      .post('/api/v1/catalog/products')
      .auth(token, { type: 'bearer' })
      .send({ sku, name: 'Tee-shirt', price: { amountMinor: 1990, currency: 'EUR' } });

  it('expose /health et /ready sans authentification', async () => {
    await api().get('/health').expect(200);
    await api()
      .get('/ready')
      .expect(200)
      .expect(({ body }) => {
        expect(body.info.database.status).toBe('up');
        expect(body.info.redis.status).toBe('up');
      });
  });

  it('refuse par défaut une requête sans token, au format RFC 9457', async () => {
    const response = await api().get('/api/v1/catalog/products?cursor=secret').expect(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      status: 401,
      title: 'Unauthorized',
      code: 'UNAUTHENTICATED',
      instance: '/api/v1/catalog/products',
    });
  });

  it('propage le request id reçu', async () => {
    const response = await api().get('/health').set('x-request-id', 'trace-123');
    expect(response.headers['x-request-id']).toBe('trace-123');
  });

  it('crée, publie et relit un produit', async () => {
    const created = await createProduct(tokenA, ' tee-blanc-m ').expect(201);
    expect(created.body).toMatchObject({ sku: 'TEE-BLANC-M', status: 'draft' });
    expect(created.body.id).toMatch(/^PRD-[0-9a-z]{20}$/);

    const id: string = created.body.id;
    await api()
      .post(`/api/v1/catalog/products/${id}/publish`)
      .auth(tokenA, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.status).toBe('active'));

    await api()
      .get(`/api/v1/catalog/products/${id}`)
      .auth(tokenA, { type: 'bearer' })
      .expect(200)
      .expect(({ body }) => expect(body.price).toEqual({ amountMinor: 1990, currency: 'EUR' }));
  });

  it('renvoie 400 avec le détail des champs invalides', async () => {
    const response = await api()
      .post('/api/v1/catalog/products')
      .auth(tokenA, { type: 'bearer' })
      .send({ sku: 'x', price: { amountMinor: -5, currency: 'GBP' } })
      .expect(400);
    expect(response.body.code).toBe('VALIDATION_FAILED');
    expect(response.body.errors.map((error: { path: string }) => error.path)).toEqual(
      expect.arrayContaining(['sku', 'name', 'price.amountMinor', 'price.currency']),
    );
  });

  it('renvoie 409 pour un SKU déjà pris et 422 pour une règle métier', async () => {
    await createProduct(tokenA, 'MUG-01').expect(201);
    await createProduct(tokenA, 'MUG-01')
      .expect(409)
      .expect(({ body }) => expect(body.code).toBe('SKU_ALREADY_EXISTS'));

    const free = await api()
      .post('/api/v1/catalog/products')
      .auth(tokenA, { type: 'bearer' })
      .send({ sku: 'FREE-01', name: 'Free', price: { amountMinor: 0, currency: 'EUR' } })
      .expect(201);
    await api()
      .post(`/api/v1/catalog/products/${free.body.id}/publish`)
      .auth(tokenA, { type: 'bearer' })
      .expect(422)
      .expect(({ body }) => expect(body.code).toBe('PRODUCT_NOT_PUBLISHABLE'));
  });

  it('refuse un ID qui n’est pas un PRD-…, avant tout accès en base', async () => {
    for (const id of [randomUUID(), 'ORD-01jb4x7k2m9qwfzp3hd8']) {
      await api()
        .get(`/api/v1/catalog/products/${id}`)
        .auth(tokenA, { type: 'bearer' })
        .expect(400)
        .expect(({ body }) => expect(body.code).toBe('VALIDATION_FAILED'));
    }
  });

  it('isole les tenants : 404 sur le produit d’un autre tenant', async () => {
    const { body } = await createProduct(tokenA, 'SECRET-01').expect(201);
    await api()
      .get(`/api/v1/catalog/products/${body.id}`)
      .auth(tokenB, { type: 'bearer' })
      .expect(404)
      .expect(({ body: problem }) => expect(problem.code).toBe('PRODUCT_NOT_FOUND'));
  });

  it('pagine la liste par curseur', async () => {
    const token = await signTestToken({
      userId: randomUUID(),
      tenantId: randomUUID(),
      roles: ['staff'],
    });
    for (const sku of ['A-01', 'A-02', 'A-03']) {
      await createProduct(token, sku).expect(201);
    }

    const first = await api()
      .get('/api/v1/catalog/products?limit=2')
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await api()
      .get('/api/v1/catalog/products')
      .query({ limit: 2, cursor: first.body.nextCursor })
      .auth(token, { type: 'bearer' })
      .expect(200);
    expect(second.body.items).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();

    await api()
      .get('/api/v1/catalog/products?cursor=forged')
      .auth(token, { type: 'bearer' })
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_CURSOR'));
  });

  it('réserve la gestion du catalogue au staff, en 403', async () => {
    await createProduct(customerTokenA, 'CUST-01')
      .expect(403)
      .expect(({ body }) => {
        expect(body.code).toBe('FORBIDDEN');
        expect(body.type).toBe('urn:problem-type:forbidden');
      });
  });

  it('ne montre à un client que les produits publiés', async () => {
    const draft = await createProduct(tokenA, 'HIDDEN-01').expect(201);
    const active = await createProduct(tokenA, 'VISIBLE-01').expect(201);
    await api()
      .post(`/api/v1/catalog/products/${active.body.id}/publish`)
      .auth(tokenA, { type: 'bearer' })
      .expect(200);

    await api()
      .get(`/api/v1/catalog/products/${draft.body.id}`)
      .auth(customerTokenA, { type: 'bearer' })
      .expect(404);
    const { body } = await api()
      .get('/api/v1/catalog/products?limit=100')
      .auth(customerTokenA, { type: 'bearer' })
      .expect(200);
    const skus = body.items.map((product: { sku: string }) => product.sku);
    expect(skus).toContain('VISIBLE-01');
    expect(skus).not.toContain('HIDDEN-01');
    expect(body.items.every((product: { status: string }) => product.status === 'active')).toBe(
      true,
    );
  });

  it('verrou optimiste : ETag, If-Match et 412 sur une copie périmée', async () => {
    const created = await createProduct(tokenA, 'ETAG-01').expect(201);
    expect(created.headers['etag']).toBe('"1"');
    const id: string = created.body.id;
    const changePrice = (amountMinor: number, ifMatch?: string) => {
      const call = api()
        .patch(`/api/v1/catalog/products/${id}/price`)
        .auth(tokenA, { type: 'bearer' });
      return (ifMatch ? call.set('If-Match', ifMatch) : call).send({
        price: { amountMinor, currency: 'EUR' },
      });
    };

    const fresh = await api()
      .get(`/api/v1/catalog/products/${id}`)
      .auth(tokenA, { type: 'bearer' })
      .expect(200);
    expect(fresh.body.version).toBe(1);

    const updated = await changePrice(2500, fresh.headers['etag']).expect(200);
    expect(updated.headers['etag']).toBe('"2"');

    // Un second membre du staff travaille encore sur la version 1.
    await changePrice(2600, '"1"')
      .expect(412)
      .expect(({ body }) => {
        expect(body.code).toBe('PRECONDITION_FAILED');
        expect(body.details).toEqual({ expectedVersion: 1, currentVersion: 2 });
      });
    await changePrice(2600, '1')
      .expect(400)
      .expect(({ body }) => expect(body.code).toBe('INVALID_IF_MATCH'));
  });
});
