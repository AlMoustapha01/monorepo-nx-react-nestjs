import type { KeysetCursor } from '@nx-react-nestjs/api-core';
import type { Order } from '../domain/order';

export interface OrderListPage {
  items: Order[];
  hasMore: boolean;
}

/**
 * Port de persistance. Chaque méthode est limitée au tenant de la requête courante :
 * l'implémentation lit le tenant dans le RequestContext, jamais dans un paramètre.
 */
export abstract class OrderRepository {
  abstract findById(id: string): Promise<Order | null>;
  /** Trié par (createdAt DESC, id DESC). */
  /** `customerId` limite aux commandes d'un client. */
  abstract list(page: {
    limit: number;
    after?: KeysetCursor;
    customerId?: string;
  }): Promise<OrderListPage>;
  /** Écrit la commande et ses lignes de façon atomique. */
  abstract insert(order: Order): Promise<void>;
  /**
   * Seuls le statut et `updatedAt` évoluent : les lignes sont figées.
   * Écrit si la ligne est encore à `order.version`, sinon ORDER_VERSION_CONFLICT.
   */
  abstract update(order: Order): Promise<void>;
}
