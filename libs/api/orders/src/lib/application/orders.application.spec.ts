import { randomUUID } from 'node:crypto';
import type { ProductSnapshot } from '@nx-react-nestjs/api-catalog';
import { domainIdGenerator } from '@nx-react-nestjs/api-core';
import { createTestRequestContext } from '@nx-react-nestjs/api-core/testing';
import { FakeProductCatalog } from './testing/fake-product-catalog';
import { InMemoryOrderRepository } from './testing/in-memory-order.repository';
import { CancelOrder } from './use-cases/cancel-order';
import { GetOrder } from './use-cases/get-order';
import { ListOrders } from './use-cases/list-orders';
import { PlaceOrder } from './use-cases/place-order';

const newProductId = domainIdGenerator('PRD');
const context = createTestRequestContext();
const tenantA = { userId: randomUUID(), tenantId: randomUUID() };
const tenantB = { userId: randomUUID(), tenantId: randomUUID() };

function setup() {
  const orders = new InMemoryOrderRepository(context);
  const catalog = new FakeProductCatalog();
  const getOrder = new GetOrder(orders);
  return {
    catalog,
    placeOrder: new PlaceOrder(orders, catalog, context),
    getOrder,
    listOrders: new ListOrders(orders),
    cancelOrder: new CancelOrder(getOrder, orders),
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

describe('commandes (couche application)', () => {
  it('passe une commande au nom du client courant, avec les prix du catalogue', () =>
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

  it('fige le prix : un changement au catalogue ne modifie pas la commande', () =>
    context.runAs(tenantA, async () => {
      const { catalog, placeOrder, getOrder } = setup();
      const tee = catalog.add(product());
      const { id } = await placeOrder.execute({ lines: [{ productId: tee.id, quantity: 1 }] });

      catalog.add({ ...tee, price: { amountMinor: 9990, currency: 'EUR' } });

      expect((await getOrder.execute(id)).totalMinor).toBe(1990);
    }));

  it('refuse les produits inconnus ou non publiés, en les listant', () =>
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

  it('refuse de mélanger les devises', () =>
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

  it('refuse deux lignes pour le même produit', () =>
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

  it('isole les tenants : une commande étrangère est introuvable', async () => {
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

  it('annule et pagine les commandes par curseur', () =>
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
});
