import type { KeysetCursor } from '@nx-react-nestjs/api-core';
import type { Product } from '../domain/product';

export interface ProductListPage {
  items: Product[];
  hasMore: boolean;
}

/**
 * Port de persistance. Chaque méthode est limitée au tenant de la requête courante :
 * l'implémentation lit le tenant dans le RequestContext, jamais dans un paramètre.
 */
export abstract class ProductRepository {
  abstract findById(id: string): Promise<Product | null>;
  abstract findBySku(sku: string): Promise<Product | null>;
  abstract findManyByIds(ids: readonly string[]): Promise<Product[]>;
  /** Trié par (createdAt DESC, id DESC). */
  abstract list(page: { limit: number; after?: KeysetCursor }): Promise<ProductListPage>;
  abstract insert(product: Product): Promise<void>;
  abstract update(product: Product): Promise<void>;
}
