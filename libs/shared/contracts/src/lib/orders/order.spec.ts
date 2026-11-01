import { MAX_ORDER_LINES, placeOrderSchema } from './order';

describe('placeOrderSchema', () => {
  const line = { productId: 'PRD-01jb4x7k2m9qwfzp3hd8', quantity: 2 };

  it('accepts a valid order', () => {
    expect(placeOrderSchema.safeParse({ lines: [line] }).success).toBe(true);
  });

  it('rejects an empty or too long order', () => {
    expect(placeOrderSchema.safeParse({ lines: [] }).success).toBe(false);
    const tooMany = Array.from({ length: MAX_ORDER_LINES + 1 }, () => line);
    expect(placeOrderSchema.safeParse({ lines: tooMany }).success).toBe(false);
  });

  it('rejects a zero or decimal quantity', () => {
    expect(placeOrderSchema.safeParse({ lines: [{ ...line, quantity: 0 }] }).success).toBe(false);
    expect(placeOrderSchema.safeParse({ lines: [{ ...line, quantity: 1.5 }] }).success).toBe(false);
  });
});
