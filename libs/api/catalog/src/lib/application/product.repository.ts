import type { KeysetCursor } from '@nx-react-nestjs/api-core';
import type { ProductStatus } from '@nx-react-nestjs/contracts';
import type { Product } from '../domain/product';

/** Variation des ventes d'un produit (négative pour une annulation). */
export interface SoldCountChange {
  productId: string;
  delta: number;
}

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
  abstract list(page: {
    limit: number;
    after?: KeysetCursor;
    status?: ProductStatus;
  }): Promise<ProductListPage>;
  abstract insert(product: Product): Promise<void>;
  /**
   * Écrit si la ligne est encore à `product.version`, puis avance la version de l'entité ;
   * sinon PRODUCT_VERSION_CONFLICT. Ne touche pas à `soldCount` (cf. `adjustSoldCounts`).
   */
  abstract update(product: Product): Promise<void>;
  /**
   * Incrément atomique en base : pas de perte de mise à jour entre ventes concurrentes.
   * N'avance pas la version : une vente ne doit pas invalider la copie d'un membre du staff.
   */
  abstract adjustSoldCounts(changes: readonly SoldCountChange[]): Promise<void>;
}
