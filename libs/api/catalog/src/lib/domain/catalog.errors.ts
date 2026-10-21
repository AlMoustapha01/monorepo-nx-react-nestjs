import { AppError, type ErrorKind } from '@nx-react-nestjs/api-core';

/** Codes stables exposés aux clients ; la catégorie décide du statut HTTP. */
const CATALOG_ERROR_KINDS = {
  PRODUCT_NOT_FOUND: 'NOT_FOUND',
  SKU_ALREADY_EXISTS: 'CONFLICT',
  /** Deux écritures concurrentes sur le même produit : la seconde doit relire et réessayer. */
  PRODUCT_VERSION_CONFLICT: 'CONFLICT',
  INVALID_PRICE: 'VALIDATION',
  PRODUCT_ARCHIVED: 'BUSINESS_RULE',
  PRODUCT_NOT_PUBLISHABLE: 'BUSINESS_RULE',
} as const satisfies Record<string, ErrorKind>;

export type CatalogErrorCode = keyof typeof CATALOG_ERROR_KINDS;

export class CatalogError extends AppError<CatalogErrorCode> {
  constructor(code: CatalogErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, CATALOG_ERROR_KINDS[code], message, details);
  }
}
