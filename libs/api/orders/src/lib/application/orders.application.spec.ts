import { randomUUID } from 'node:crypto';
import type { ProductSnapshot } from '@nx-react-nestjs/api-catalog';
import { domainIdGenerator } from '@nx-react-nestjs/api-core';
import {
  createTestRequestContext,
  InlineTransactionManager,
  RecordingOutbox,
} from '@nx-react-nestjs/api-core/testing';
import { OrderCancelled, OrderPlaced } from '@nx-react-nestjs/contracts';
import { FakeProductCatalog } from './testing/fake-product-catalog';
import { InMemoryOrderRepository } from './testing/in-memory-order.repository';
import { CancelOrder } from './use-cases/cancel-order';
import { GetOrder } from './use-cases/get-order';
import { ListOrders } from './use-cases/list-orders';
import { PlaceOrder } from './use-cases/place-order';

const newProductId = domainIdGenerator('PRD');
const context = createTestRequestContext();
const tenantA = { userId: randomUUID(), tenantId: randomUUID(), email: 'ada@example.com' };
const tenantB = { userId: randomUUID(), tenantId: randomUUID() };

function setup() {
  const orders = new InMemoryOrderRepository(context);
  const catalog = new FakeProductCatalog();
  const getOrder = new GetOrder(orders, context);
  const outbox = new RecordingOutbox();
  const transactions = new InlineTransactionManager();
  return {
    catalog,
    outbox,
    placeOrder: new PlaceOrder(orders, catalog, context, transactions, outbox),
    getOrder,
    listOrders: new ListOrders(orders, context),
    cancelOrder: new CancelOrder(getOrder, orders, transactions, outbox),
  };
}

const product = (overrides: Partial<ProductSnapshot> = {}): ProductSnapshot => ({
  id: newProductId(),
  sku: 'TEE-01',
  name: 'Tee-shirt',
  price: { amountMinor: 1990, currency: 'EUR' },
  purchasable: true,
  ...overrides,
});

describe('orders (application layer)', () => {
  it('places an order on behalf of the current customer, with catalog prices', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder, getOrder } = setup();
      const tee = catalog.add(product());
      const mug = catalog.add(
        product({ sku: 'MUG-01', name: 'Mug', price: { amountMinor: 900, currency: 'EUR' } }),
      );

      const placed = await placeOrder.execute({
        lines: [
          { productId: tee.id, quantity: 2 },
          { productId: mug.id, quantity: 1 },
        ],
      });

      const order = await getOrder.execute(placed.id);
      expect(order).toMatchObject({
        customerId: tenantA.userId,
        tenantId: tenantA.tenantId,
        status: 'placed',
        currency: 'EUR',
        totalMinor: 1990 * 2 + 900,
      });
      expect(order.lines.map((line) => line.sku)).toEqual(['TEE-01', 'MUG-01']);
    }));

  it('publishes OrderPlaced with the customer email, for other domains', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder, outbox } = setup();
      const tee = catalog.add(product());
      const order = await placeOrder.execute({ lines: [{ productId: tee.id, quantity: 2 }] });

      expect(outbox.ofType(OrderPlaced)).toEqual([
        expect.objectContaining({
          orderId: order.id,
          customerId: tenantA.userId,
          customerEmail: 'ada@example.com',
          totalMinor: 3980,
          lines: [
            expect.objectContaining({ productId: tee.id, quantity: 2, unitPriceMinor: 1990 }),
          ],
        }),
      ]);
    }));

  it('publishes nothing if the order is rejected', () =>
    context.runAs(tenantA, async () => {
      const { placeOrder, outbox } = setup();
      await expect(
        placeOrder.execute({ lines: [{ productId: newProductId(), quantity: 1 }] }),
      ).rejects.toMatchObject({ code: 'PRODUCT_UNAVAILABLE' });
      expect(outbox.published).toEqual([]);
    }));

  it('publishes OrderCancelled only once, even if the cancellation is repeated', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder, cancelOrder, outbox } = setup();
      const tee = catalog.add(product());
      const { id } = await placeOrder.execute({ lines: [{ productId: tee.id, quantity: 3 }] });

      await cancelOrder.execute(id);
      await cancelOrder.execute(id);

      expect(outbox.ofType(OrderCancelled)).toEqual([
        expect.objectContaining({ orderId: id, lines: [{ productId: tee.id, quantity: 3 }] }),
      ]);
    }));

  it('freezes the price: a catalog change does not modify the order', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder, getOrder } = setup();
      const tee = catalog.add(product());
      const { id } = await placeOrder.execute({ lines: [{ productId: tee.id, quantity: 1 }] });

      catalog.add({ ...tee, price: { amountMinor: 9990, currency: 'EUR' } });

      expect((await getOrder.execute(id)).totalMinor).toBe(1990);
    }));

  it('rejects unknown or unpublished products, listing them', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder } = setup();
      const draft = catalog.add(product({ purchasable: false }));
      const unknownId = newProductId();

      await expect(
        placeOrder.execute({
          lines: [
            { productId: draft.id, quantity: 1 },
            { productId: unknownId, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({
        code: 'PRODUCT_UNAVAILABLE',
        details: { productIds: [draft.id, unknownId] },
      });
    }));

  it('refuses to mix currencies', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder } = setup();
      const eur = catalog.add(product());
      const usd = catalog.add(
        product({ sku: 'TEE-US', price: { amountMinor: 1990, currency: 'USD' } }),
      );

      await expect(
        placeOrder.execute({
          lines: [
            { productId: eur.id, quantity: 1 },
            { productId: usd.id, quantity: 1 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'CURRENCY_MISMATCH' });
    }));

  it('rejects two lines for the same product', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder } = setup();
      const tee = catalog.add(product());

      await expect(
        placeOrder.execute({
          lines: [
            { productId: tee.id, quantity: 1 },
            { productId: tee.id, quantity: 2 },
          ],
        }),
      ).rejects.toMatchObject({ code: 'DUPLICATE_ORDER_LINE' });
    }));

  it('isolates tenants: an order from another tenant is not found', async () => {
    const { catalog, placeOrder, getOrder, cancelOrder } = setup();
    const tee = catalog.add(product());
    const { id } = await context.runAs(tenantA, () =>
      placeOrder.execute({ lines: [{ productId: tee.id, quantity: 1 }] }),
    );

    await context.runAs(tenantB, async () => {
      await expect(getOrder.execute(id)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
      await expect(cancelOrder.execute(id)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
    });
    expect((await context.runAs(tenantA, () => getOrder.execute(id))).status).toBe('placed');
  });

  it('cancels and paginates orders by cursor', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder, cancelOrder, listOrders } = setup();
      const tee = catalog.add(product());
      const ids: string[] = [];
      for (let i = 0; i < 3; i++) {
        ids.push((await placeOrder.execute({ lines: [{ productId: tee.id, quantity: 1 }] })).id);
      }
      await cancelOrder.execute(ids[0] ?? '');

      const first = await listOrders.execute({ limit: 2 });
      const second = await listOrders.execute({ limit: 2, cursor: first.nextCursor ?? undefined });

      const all = [...first.items, ...second.items];
      expect(new Set(all.map((order) => order.id))).toEqual(new Set(ids));
      expect(second.nextCursor).toBeNull();
      expect(all.find((order) => order.id === ids[0])?.status).toBe('cancelled');
    }));

  describe('order ownership', () => {
    const otherCustomer = { userId: randomUUID(), tenantId: tenantA.tenantId };
    const staff = { userId: randomUUID(), tenantId: tenantA.tenantId, roles: ['staff'] as const };

    it('a customer neither sees nor cancels the order of another customer', async () => {
      const { catalog, placeOrder, getOrder, cancelOrder, listOrders } = setup();
      const tee = catalog.add(product());
      const { id } = await context.runAs(tenantA, () =>
        placeOrder.execute({ lines: [{ productId: tee.id, quantity: 1 }] }),
      );

      await context.runAs(otherCustomer, async () => {
        await expect(getOrder.execute(id)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
        await expect(cancelOrder.execute(id)).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND' });
        expect((await listOrders.execute({ limit: 20 })).items).toEqual([]);
      });
      expect((await context.runAs(tenantA, () => getOrder.execute(id))).status).toBe('placed');
    });

    it('staff see and cancel all orders of the tenant', async () => {
      const { catalog, placeOrder, cancelOrder, listOrders } = setup();
      const tee = catalog.add(product());
      for (const customer of [tenantA, otherCustomer]) {
        await context.runAs(customer, () =>
          placeOrder.execute({ lines: [{ productId: tee.id, quantity: 1 }] }),
        );
      }

      await context.runAs(staff, async () => {
        const { items } = await listOrders.execute({ limit: 20 });
        expect(new Set(items.map((order) => order.customerId))).toEqual(
          new Set([tenantA.userId, otherCustomer.userId]),
        );
        await expect(cancelOrder.execute(items[0]?.id ?? '')).resolves.toMatchObject({
          status: 'cancelled',
        });
      });
    });
  });
});
