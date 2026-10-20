import type { ProductSnapshot } from '@nx-react-nestjs/api-catalog';
import { ProductCatalog } from '../product-catalog.port';

/** Catalogue en mémoire ; les tests y déposent les produits visibles par le tenant courant. */
export class FakeProductCatalog extends ProductCatalog {
  private readonly products = new Map<string, ProductSnapshot>();

  add(product: ProductSnapshot): ProductSnapshot {
    this.products.set(product.id, product);
    return product;
  }

  async getProducts(ids: readonly string[]): Promise<ProductSnapshot[]> {
    return [...new Set(ids)].flatMap((id) => this.products.get(id) ?? []);
  }
}
