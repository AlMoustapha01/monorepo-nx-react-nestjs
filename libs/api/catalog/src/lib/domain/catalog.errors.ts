import { AppError, type ErrorKind } from '@nx-react-nestjs/api-core';

/** Codes stables exposés aux clients ; la catégorie décide du statut HTTP. */
const CATALOG_ERROR_KINDS = {
  /** Produit inexistant, d'un autre tenant, ou non publié pour un client. */
  PRODUCT_NOT_FOUND: 'NOT_FOUND',
  /** Le SKU est déjà pris dans le tenant. */
  SKU_ALREADY_EXISTS: 'CONFLICT',
  /** Deux écritures concurrentes sur le même produit : la seconde doit relire et réessayer. */
  PRODUCT_VERSION_CONFLICT: 'CONFLICT',
  /** Prix négatif, non entier, ou nul pour un produit publié. */
  INVALID_PRICE: 'VALIDATION',
  /** Un produit archivé ne se modifie plus. */
  PRODUCT_ARCHIVED: 'BUSINESS_RULE',
  /** Un produit à prix nul ne se publie pas. */
  PRODUCT_NOT_PUBLISHABLE: 'BUSINESS_RULE',
} as const satisfies Record<string, ErrorKind>;

export type CatalogErrorCode = keyof typeof CATALOG_ERROR_KINDS;

export class CatalogError extends AppError<CatalogErrorCode> {
  constructor(code: CatalogErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, CATALOG_ERROR_KINDS[code], message, details);
  }
}
