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
import { GenericContainer, type StartedTestContainer, Wait } from 'testcontainers';
import { AppModule } from '../src/app/app.module';

interface MailpitMessage {
  Subject: string;
  To: { Address: string }[];
}

/** Commande passée → outbox → BullMQ → email reçu par un vrai serveur SMTP (Mailpit). */
describe('Email de confirmation de commande (e2e)', () => {
  let database: TestDatabase;
  let redis: TestRedis;
  let mailpit: StartedTestContainer;
  let app: INestApplication;
  const customer = { userId: randomUUID(), tenantId: randomUUID(), email: 'ada@example.com' };
  let token: string;
  let staffToken: string;

  beforeAll(async () => {
    [database, redis, mailpit] = await Promise.all([
      startTestDatabase(),
      startTestRedis(),
      new GenericContainer('axllent/mailpit:v1.31.3')
        .withExposedPorts(1025, 8025)
        .withWaitStrategy(Wait.forHttp('/readyz', 8025))
        .start(),
    ]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }), {
      SMTP_URL: `smtp://${mailpit.getHost()}:${mailpit.getMappedPort(1025)}`,
    });

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication({ bufferLogs: true });
    configureApp(app);
    await app.init();
    token = await signTestToken(customer);
    staffToken = await signTestToken({
      userId: randomUUID(),
      tenantId: customer.tenantId,
      roles: ['staff'],
    });
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([database?.stop(), redis?.stop(), mailpit?.stop()]);
  });

  const api = () => request(app.getHttpServer());

  async function inbox(): Promise<MailpitMessage[]> {
    const response = await fetch(
      `http://${mailpit.getHost()}:${mailpit.getMappedPort(8025)}/api/v1/messages`,
    );
    return ((await response.json()) as { messages: MailpitMessage[] }).messages;
  }

  it('envoie la confirmation au client après la commande', async () => {
    const product = await api()
      .post('/api/v1/catalog/products')
      .auth(staffToken, { type: 'bearer' })
      .send({ sku: 'MAIL-TEE', name: 'Tee-shirt', price: { amountMinor: 1990, currency: 'EUR' } })
      .expect(201);
    await api()
      .post(`/api/v1/catalog/products/${product.body.id}/publish`)
      .auth(staffToken, { type: 'bearer' })
      .expect(200);

    const order = await api()
      .post('/api/v1/orders')
      .auth(token, { type: 'bearer' })
      .set('Idempotency-Key', randomUUID())
      .send({ lines: [{ productId: product.body.id, quantity: 2 }] })
      .expect(201);

    await eventually(async () => {
      expect(await inbox()).toEqual([
        expect.objectContaining({
          Subject: `Votre commande ${order.body.id} est confirmée`,
          To: [expect.objectContaining({ Address: 'ada@example.com' })],
        }),
      ]);
    }, 20_000);
  });
});
