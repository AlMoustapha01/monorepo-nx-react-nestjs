import type { Money } from '@nx-react-nestjs/contracts';

/** Vue figée d'un produit pour les autres domaines (commandes, panier…). */
export interface ProductSnapshot {
  readonly id: string;
  readonly sku: string;
  readonly name: string;
  readonly price: Readonly<Money>;
  readonly purchasable: boolean;
}
