import { randomUUID } from 'node:crypto';
import { domainIdGenerator } from '@nx-react-nestjs/api-core';
import { createTestRequestContext } from '@nx-react-nestjs/api-core/testing';
import type { CreateProductInput } from '@nx-react-nestjs/contracts';
import { CatalogFacade } from './catalog.facade';
import { InMemoryProductRepository } from './testing/in-memory-product.repository';
import { CreateProduct } from './use-cases/create-product';
import { GetProduct } from './use-cases/get-product';
import { ListProducts } from './use-cases/list-products';
import { ChangeProductPrice, PublishProduct } from './use-cases/update-product';

const context = createTestRequestContext();
const tenantA = { userId: randomUUID(), tenantId: randomUUID() };
const tenantB = { userId: randomUUID(), tenantId: randomUUID() };

function setup() {
  const products = new InMemoryProductRepository(context);
  const getProduct = new GetProduct(products);
  return {
    createProduct: new CreateProduct(products, context),
    getProduct,
    listProducts: new ListProducts(products),
    changePrice: new ChangeProductPrice(getProduct, products),
    publish: new PublishProduct(getProduct, products),
    facade: new CatalogFacade(products),
  };
}

const input = (sku: string): CreateProductInput => ({
  sku,
  name: `Product ${sku}`,
  price: { amountMinor: 1990, currency: 'EUR' },
});

describe('catalogue (couche application)', () => {
  it('crée un produit en brouillon dans le tenant courant', () =>
    context.runAs(tenantA, async () => {
      const { createProduct, getProduct } = setup();
      const created = await createProduct.execute(input('TEE-01'));

      const found = await getProduct.execute(created.id);
      expect(found).toMatchObject({ sku: 'TEE-01', status: 'draft', tenantId: tenantA.tenantId });
    }));

  it('refuse un SKU déjà utilisé dans le même tenant', () =>
    context.runAs(tenantA, async () => {
      const { createProduct } = setup();
      await createProduct.execute(input('TEE-01'));
      await expect(createProduct.execute(input('TEE-01'))).rejects.toMatchObject({
        code: 'SKU_ALREADY_EXISTS',
      });
    }));

  it('isole les tenants : un produit étranger est introuvable', async () => {
    const { createProduct, getProduct } = setup();
    const created = await context.runAs(tenantA, () => createProduct.execute(input('TEE-01')));

    await context.runAs(tenantB, async () => {
      await expect(getProduct.execute(created.id)).rejects.toMatchObject({
        code: 'PRODUCT_NOT_FOUND',
      });
      // Le même SKU est libre dans un autre tenant.
      await expect(createProduct.execute(input('TEE-01'))).resolves.toBeDefined();
    });
  });

  it('pagine par curseur sans doublon ni trou', () =>
    context.runAs(tenantA, async () => {
      const { createProduct, listProducts } = setup();
      for (const sku of ['SKU-1', 'SKU-2', 'SKU-3', 'SKU-4', 'SKU-5']) {
        await createProduct.execute(input(sku));
      }

      const seen: string[] = [];
      let cursor: string | undefined;
      do {
        const page = await listProducts.execute({ limit: 2, cursor });
        seen.push(...page.items.map((product) => product.sku));
        cursor = page.nextCursor ?? undefined;
      } while (cursor);

      expect(seen).toHaveLength(5);
      expect(new Set(seen).size).toBe(5);
    }));

  it('persiste les changements de prix et la publication', () =>
    context.runAs(tenantA, async () => {
      const { createProduct, changePrice, publish, getProduct } = setup();
      const { id } = await createProduct.execute(input('TEE-01'));

      await changePrice.execute(id, { price: { amountMinor: 2490, currency: 'EUR' } });
      await publish.execute(id);

      const product = await getProduct.execute(id);
      expect(product.price.amountMinor).toBe(2490);
      expect(product.isPurchasable).toBe(true);
    }));

  it('expose aux autres domaines des snapshots, sans doublon', () =>
    context.runAs(tenantA, async () => {
      const { createProduct, publish, facade } = setup();
      const { id } = await createProduct.execute(input('TEE-01'));
      await publish.execute(id);

      const snapshots = await facade.getProducts([id, id, domainIdGenerator('PRD')()]);
      expect(snapshots).toEqual([
        {
          id,
          sku: 'TEE-01',
          name: 'Product TEE-01',
          price: { amountMinor: 1990, currency: 'EUR' },
          purchasable: true,
        },
      ]);
    }));
});
