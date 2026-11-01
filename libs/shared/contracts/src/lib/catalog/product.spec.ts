import { createProductSchema, skuSchema } from './product';

describe('skuSchema', () => {
  it('uppercases and strips spaces', () => {
    expect(skuSchema.parse('  tee-shirt-01 ')).toBe('TEE-SHIRT-01');
  });

  it.each(['ab', '-ABC', 'ABC-', 'AB C', 'É123'])('rejects %s', (sku) => {
    expect(skuSchema.safeParse(sku).success).toBe(false);
  });
});

describe('createProductSchema', () => {
  it('rejects a decimal price', () => {
    const result = createProductSchema.safeParse({
      sku: 'TEE-01',
      name: 'Tee-shirt',
      price: { amountMinor: 19.9, currency: 'EUR' },
    });
    expect(result.success).toBe(false);
  });
});
