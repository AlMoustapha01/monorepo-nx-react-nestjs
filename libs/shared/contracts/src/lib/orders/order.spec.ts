import { randomUUID } from 'node:crypto';
import { MAX_ORDER_LINES, placeOrderSchema } from './order';

describe('placeOrderSchema', () => {
  const line = { productId: randomUUID(), quantity: 2 };

  it('accepte une commande valide', () => {
    expect(placeOrderSchema.safeParse({ lines: [line] }).success).toBe(true);
  });

  it('refuse une commande vide ou trop longue', () => {
    expect(placeOrderSchema.safeParse({ lines: [] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_ORDER_LINES + 1 }, () => line);
    expect(placeOrderSchema.safeParse({ lines: tooMany }).success).toBe(false);
  });

  it('refuse une quantité nulle ou décimale', () => {
    expect(placeOrderSchema.safeParse({ lines: [{ ...line, quantity: 0 }] }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ lines: [{ ...line, quantity: 1.5 }] }).success).toBe(false);
  });
});
