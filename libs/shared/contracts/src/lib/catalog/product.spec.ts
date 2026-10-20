import { createProductSchema, skuSchema } from './product';

describe('skuSchema', () => {
  it('normalise en majuscules et retire les espaces', () => {
    expect(skuSchema.parse('  tee-shirt-01 ')).toBe('TEE-SHIRT-01');
  });

  it.each(['ab', '-ABC', 'ABC-', 'AB C', 'É123'])('rejette %s', (sku) => {
    expect(skuSchema.safeParse(sku).success).toBe(false);
  });
});

describe('createProductSchema', () => {
  it('refuse un prix décimal', () => {
    const result = createProductSchema.safeParse({
      sku: 'TEE-01',
      name: 'Tee-shirt',
      price: { amountMinor: 19.9, currency: 'EUR' },
    });
    expect(result.success).toBe(false);
  });
});
