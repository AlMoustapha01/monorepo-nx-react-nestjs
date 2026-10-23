import { AppError, type ErrorKind } from '@nx-react-nestjs/api-core';

/** Codes stables exposés aux clients ; la catégorie décide du statut HTTP. */
const ORDERS_ERROR_KINDS = {
  /** Commande inexistante, d'un autre tenant, ou d'un autre client (sauf pour le staff). */
  ORDER_NOT_FOUND: 'NOT_FOUND',
  /** Deux écritures concurrentes (ex. deux annulations) : la seconde doit relire et réessayer. */
  ORDER_VERSION_CONFLICT: 'CONFLICT',
  /** Une commande a au moins une ligne. */
  EMPTY_ORDER: 'VALIDATION',
  /** Un produit n'apparaît qu'une fois par commande. */
  DUPLICATE_ORDER_LINE: 'VALIDATION',
  /** Quantité ou prix unitaire qui n'est pas un entier valide. */
  INVALID_ORDER_LINE: 'VALIDATION',
  /** Produit inconnu, d'un autre tenant ou non publié : même réponse dans les trois cas. */
  PRODUCT_UNAVAILABLE: 'BUSINESS_RULE',
  /** Tous les produits d'une commande ont la même devise. */
  CURRENCY_MISMATCH: 'BUSINESS_RULE',
} as const satisfies Record<string, ErrorKind>;

export type OrdersErrorCode = keyof typeof ORDERS_ERROR_KINDS;

export class OrdersError extends AppError<OrdersErrorCode> {
  constructor(code: OrdersErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, ORDERS_ERROR_KINDS[code], message, details);
  }
}
