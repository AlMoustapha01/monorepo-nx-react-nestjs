import { randomUUID } from 'node:crypto';
import { DatabaseSession, domainIdGenerator } from '@nx-react-nestjs/api-core';
import {
  createTestRequestContext,
  startTestDatabase,
  type TestDatabase,
} from '@nx-react-nestjs/api-core/testing';
import { Order } from '../domain/order';
import { DrizzleOrderRepository } from './drizzle-order.repository';

const newProductId = domainIdGenerator('PRD');
const newOrderId = domainIdGenerator('ORD');

describe('DrizzleOrderRepository (Postgres réel)', () => {
  const context = createTestRequestContext();
  const tenantA = { userId: randomUUID(), tenantId: randomUUID() };
  const tenantB = { userId: randomUUID(), tenantId: randomUUID() };
  let database: TestDatabase;
  let repository: DrizzleOrderRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    repository = new DrizzleOrderRepository(new DatabaseSession(database.db), context);
  });

  afterAll(() => database?.stop());

  const newOrder = (tenantId: string, createdAt = new Date()) =>
    Order.place({
      id: newOrderId(),
      tenantId,
      customerId: randomUUID(),
      currency: 'EUR',
      lines: [
        {
          productId: newProductId(),
          sku: 'TEE-01',
          name: 'Tee',
          unitPriceMinor: 1990,
          quantity: 2,
        },
        { productId: newProductId(), sku: 'MUG-01', name: 'Mug', unitPriceMinor: 900, quantity: 1 },
      ],
      now: createdAt,
    });

  it('relit la commande avec ses lignes, dans l’ordre', () =>
    context.runAs(tenantA, async () => {
      const order = newOrder(tenantA.tenantId);
      await repository.insert(order);

      const found = await repository.findById(order.id);
      expect(found?.lines).toEqual(order.lines);
      expect(found?.totalMinor).toBe(1990 * 2 + 900);
    }));

  it('persiste l’annulation', () =>
    context.runAs(tenantA, async () => {
      const order = newOrder(tenantA.tenantId);
      await repository.insert(order);
      order.cancel(new Date());
      await repository.update(order);

      expect(await repository.findById(order.id)).toMatchObject({
        status: 'cancelled',
        updatedAt: order.updatedAt,
      });
    }));

  it('ne lit ni ne modifie jamais les commandes d’un autre tenant', async () => {
    const foreign = newOrder(tenantB.tenantId);
    await context.runAs(tenantB, () => repository.insert(foreign));

    await context.runAs(tenantA, async () => {
      expect(await repository.findById(foreign.id)).toBeNull();
      foreign.cancel(new Date());
      await repository.update(foreign);
    });

    const untouched = await context.runAs(tenantB, () => repository.findById(foreign.id));
    expect(untouched?.status).toBe('placed');
  });

  it('écrit commande et lignes dans le tenant du contexte, pas celui de l’entité', async () => {
    const forged = newOrder(tenantB.tenantId);
    await context.runAs(tenantA, () => repository.insert(forged));

    expect(await context.runAs(tenantB, () => repository.findById(forged.id))).toBeNull();
    const own = await context.runAs(tenantA, () => repository.findById(forged.id));
    expect(own?.lines).toHaveLength(2);
  });

  it('pagine par (created_at, id) décroissants et charge les lignes de chaque page', async () => {
    const tenant = { userId: randomUUID(), tenantId: randomUUID() };
    const sameInstant = new Date('2026-10-20T10:00:00.000Z');
    const inserted = [1, 2, 3].map(() => newOrder(tenant.tenantId, sameInstant));

    await context.runAs(tenant, async () => {
      for (const order of inserted) {
        await repository.insert(order);
      }

      const first = await repository.list({ limit: 2 });
      const second = await repository.list({ limit: 2, after: first.items.at(-1) });
      expect([first.hasMore, second.hasMore]).toEqual([true, false]);

      const all = [...first.items, ...second.items];
      expect(all.map((order) => order.id)).toEqual(
        inserted
          .map((order) => order.id)
          .sort()
          .reverse(),
      );
      expect(all.every((order) => order.lines.length === 2)).toBe(true);
    });
  });
});
