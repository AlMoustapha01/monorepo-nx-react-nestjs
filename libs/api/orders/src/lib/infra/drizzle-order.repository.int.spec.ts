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

describe('DrizzleOrderRepository (real Postgres)', () => {
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

  it('reads back the order with its lines, in order', () =>
    context.runAs(tenantA, async () => {
      const order = newOrder(tenantA.tenantId);
      await repository.insert(order);

      const found = await repository.findById(order.id);
      expect(found?.lines).toEqual(order.lines);
      expect(found?.totalMinor).toBe(1990 * 2 + 900);
    }));

  it('persists the cancellation', () =>
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

  it('never reads or modifies the orders of another tenant', async () => {
    const foreign = newOrder(tenantB.tenantId);
    await context.runAs(tenantB, () => repository.insert(foreign));

    await context.runAs(tenantA, async () => {
      expect(await repository.findById(foreign.id)).toBeNull();
      foreign.cancel(new Date());
      // L'écriture conditionnelle ne trouve aucune ligne de ce tenant : rien n'est écrit.
      await expect(repository.update(foreign)).rejects.toMatchObject({
        code: 'ORDER_VERSION_CONFLICT',
      });
    });

    const untouched = await context.runAs(tenantB, () => repository.findById(foreign.id));
    expect(untouched?.status).toBe('placed');
  });

  it('writes the order and its lines to the context tenant, not the entity tenant', async () => {
    const forged = newOrder(tenantB.tenantId);
    await context.runAs(tenantA, () => repository.insert(forged));

    expect(await context.runAs(tenantB, () => repository.findById(forged.id))).toBeNull();
    const own = await context.runAs(tenantA, () => repository.findById(forged.id));
    expect(own?.lines).toHaveLength(2);
  });

  it('filters the list by customer', async () => {
    const tenant = { userId: randomUUID(), tenantId: randomUUID() };
    const mine = newOrder(tenant.tenantId);
    const theirs = newOrder(tenant.tenantId);
    await context.runAs(tenant, async () => {
      await repository.insert(mine);
      await repository.insert(theirs);
      const page = await repository.list({ limit: 10, customerId: mine.customerId });
      expect(page.items.map((order) => order.id)).toEqual([mine.id]);
    });
  });

  it('paginates by (created_at, id) descending and loads the lines of each page', async () => {
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

  it('optimistic locking: a second concurrent cancellation is rejected', () =>
    context.runAs(tenantA, async () => {
      const order = newOrder(tenantA.tenantId);
      await repository.insert(order);

      const [first, second] = [
        await repository.findById(order.id),
        await repository.findById(order.id),
      ];
      first?.cancel(new Date());
      second?.cancel(new Date());
      await repository.update(first!);
      await expect(repository.update(second!)).rejects.toMatchObject({
        code: 'ORDER_VERSION_CONFLICT',
      });
      expect((await repository.findById(order.id))?.version).toBe(2);
    }));
});
