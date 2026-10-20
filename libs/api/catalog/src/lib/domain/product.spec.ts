import { CatalogError } from './catalog.errors';
import { Money } from './money';
import { Product } from './product';

const T0 = new Date('2026-10-20T08:00:00.000Z');
const T1 = new Date('2026-10-20T09:00:00.000Z');

function draftProduct(amountMinor = 1990): Product {
  return Product.create({
    id: '0199f5c2-0000-7000-8000-000000000001',
    tenantId: '0199f5c2-0000-7000-8000-0000000000aa',
    sku: 'TEE-01',
    name: 'Tee-shirt',
    description: null,
    price: Money.of(amountMinor, 'EUR'),
    now: T0,
  });
}

describe('Money', () => {
  it.each([-1, 19.9, Number.MAX_SAFE_INTEGER + 1])('rejette le montant %s', (amount) => {
    expect(() => Money.of(amount, 'EUR')).toThrow(CatalogError);
  });

  it('compare montant et devise', () => {
    expect(Money.of(100, 'EUR').equals(Money.of(100, 'EUR'))).toBe(true);
    expect(Money.of(100, 'EUR').equals(Money.of(100, 'USD'))).toBe(false);
  });
});

describe('Product', () => {
  it('naît en brouillon, non vendable', () => {
    const product = draftProduct();
    expect(product.status).toBe('draft');
    expect(product.isPurchasable).toBe(false);
    expect(product.createdAt).toEqual(T0);
  });

  it('devient vendable une fois publié', () => {
    const product = draftProduct();
    product.publish(T1);
    expect(product.status).toBe('active');
    expect(product.isPurchasable).toBe(true);
    expect(product.updatedAt).toEqual(T1);
  });

  it('ne peut pas être publié à prix nul', () => {
    expect(() => draftProduct(0).publish(T1)).toThrow(
      expect.objectContaining({ code: 'PRODUCT_NOT_PUBLISHABLE' }),
    );
  });

  it('refuse un prix nul une fois actif', () => {
    const product = draftProduct();
    product.publish(T1);
    expect(() => product.changePrice(Money.of(0, 'EUR'), T1)).toThrow(
      expect.objectContaining({ code: 'INVALID_PRICE' }),
    );
  });

  it('est figé une fois archivé', () => {
    const product = draftProduct();
    product.archive(T1);
    expect(() => product.publish(T1)).toThrow(
      expect.objectContaining({ code: 'PRODUCT_ARCHIVED' }),
    );
    expect(() => product.changePrice(Money.of(500, 'EUR'), T1)).toThrow(
      expect.objectContaining({ code: 'PRODUCT_ARCHIVED' }),
    );
  });

  it('publier deux fois ne change rien', () => {
    const product = draftProduct();
    product.publish(T1);
    product.publish(new Date('2026-10-21T00:00:00.000Z'));
    expect(product.updatedAt).toEqual(T1);
  });
});
