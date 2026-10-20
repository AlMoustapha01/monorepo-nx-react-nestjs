import { randomUUID } from 'node:crypto';
import { type NewOrder, Order, type OrderLine } from './order';

const line = (overrides: Partial<OrderLine> = {}): OrderLine => ({
  productId: randomUUID(),
  sku: 'TEE-01',
  name: 'Tee-shirt',
  unitPriceMinor: 1990,
  quantity: 2,
  ...overrides,
});

const newOrder = (lines: OrderLine[]): NewOrder => ({
  id: randomUUID(),
  tenantId: randomUUID(),
  customerId: randomUUID(),
  currency: 'EUR',
  lines,
  now: new Date('2026-10-20T10:00:00.000Z'),
});

describe('Order', () => {
  it('passe une commande et calcule son total depuis les lignes', () => {
    const order = Order.place(newOrder([line(), line({ unitPriceMinor: 500, quantity: 3 })]));
    expect(order.status).toBe('placed');
    expect(order.totalMinor).toBe(1990 * 2 + 500 * 3);
  });

  it('refuse une commande vide', () => {
    expect(() => Order.place(newOrder([]))).toThrow(
      expect.objectContaining({ code: 'EMPTY_ORDER' }),
    );
  });

  it('refuse deux lignes pour le même produit', () => {
    const productId = randomUUID();
    expect(() => Order.place(newOrder([line({ productId }), line({ productId })]))).toThrow(
      expect.objectContaining({ code: 'DUPLICATE_ORDER_LINE' }),
    );
  });

  it('refuse une quantité ou un prix invalide', () => {
    for (const invalid of [{ quantity: 0 }, { quantity: 1.5 }, { unitPriceMinor: -1 }]) {
      expect(() => Order.place(newOrder([line(invalid)]))).toThrow(
        expect.objectContaining({ code: 'INVALID_ORDER_LINE' }),
      );
    }
  });

  it('annule une commande, de façon idempotente', () => {
    const order = Order.place(newOrder([line()]));
    const cancelledAt = new Date('2026-10-21T10:00:00.000Z');
    order.cancel(cancelledAt);
    order.cancel(new Date('2026-10-22T10:00:00.000Z'));
    expect(order.status).toBe('cancelled');
    expect(order.updatedAt).toEqual(cancelledAt);
  });

  it('isole ses lignes des mutations de l’appelant', () => {
    const lines = [line()];
    const order = Order.place(newOrder(lines));
    (lines[0] as { quantity: number }).quantity = 50;
    expect(order.lines[0]?.quantity).toBe(2);
  });
});
