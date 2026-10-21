import { AppError, type ErrorKind } from '@nx-react-nestjs/api-core';

/** Codes stables exposés aux clients ; la catégorie décide du statut HTTP. */
const ORDERS_ERROR_KINDS = {
  ORDER_NOT_FOUND: 'NOT_FOUND',
  /** Deux écritures concurrentes (ex. deux annulations) : la seconde doit relire et réessayer. */
  ORDER_VERSION_CONFLICT: 'CONFLICT',
  EMPTY_ORDER: 'VALIDATION',
  DUPLICATE_ORDER_LINE: 'VALIDATION',
  INVALID_ORDER_LINE: 'VALIDATION',
  PRODUCT_UNAVAILABLE: 'BUSINESS_RULE',
  CURRENCY_MISMATCH: 'BUSINESS_RULE',
} as const satisfies Record<string, ErrorKind>;

export type OrdersErrorCode = keyof typeof ORDERS_ERROR_KINDS;

export class OrdersError extends AppError<OrdersErrorCode> {
  constructor(code: OrdersErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, ORDERS_ERROR_KINDS[code], message, details);
  }
}
