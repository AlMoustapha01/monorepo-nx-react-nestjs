import { Injectable } from '@nestjs/common';
import type { ProductSnapshot } from './catalog.contracts';
import { ProductRepository } from './product.repository';

/**
 * Seule API du catalogue offerte aux autres domaines.
 * Elle renvoie des snapshots, jamais l'entité Product ni le repository.
 */
@Injectable()
export class CatalogFacade {
  constructor(private readonly products: ProductRepository) {}

  /** Produits du tenant courant ; les IDs inconnus sont ignorés. */
  async getProducts(ids: readonly string[]): Promise<ProductSnapshot[]> {
    if (ids.length === 0) {
      return [];
    }
    const products = await this.products.findManyByIds([...new Set(ids)]);
    return products.map((product) => ({
      id: product.id,
      sku: product.sku,
      name: product.name,
      price: { amountMinor: product.price.amountMinor, currency: product.price.currency },
      purchasable: product.isPurchasable,
    }));
  }
}
