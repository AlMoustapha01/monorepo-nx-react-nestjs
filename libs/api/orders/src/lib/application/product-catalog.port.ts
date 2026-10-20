import type { ProductSnapshot } from '@nx-react-nestjs/api-catalog';

/**
 * Ce dont les commandes ont besoin du catalogue, et rien de plus.
 * L'adapter (infra/) délègue à la façade du catalogue ; les tests utilisent un fake.
 */
export abstract class ProductCatalog {
  /** Produits du tenant courant ; les IDs inconnus sont absents du résultat. */
  abstract getProducts(ids: readonly string[]): Promise<ProductSnapshot[]>;
}
