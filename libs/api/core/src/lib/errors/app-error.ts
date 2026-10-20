/**
 * Catégorie d'erreur : la seule information que la couche HTTP utilise pour choisir le statut.
 * Le domaine ne connaît pas HTTP.
 */
export type ErrorKind =
  | 'VALIDATION'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'BUSINESS_RULE'
  | 'INTERNAL';

/**
 * Base de toutes les erreurs applicatives. Chaque domaine en dérive une classe
 * dont le `code` est une union littérale stable (contrat pour les clients).
 */
export abstract class AppError<TCode extends string = string> extends Error {
  protected constructor(
    readonly code: TCode,
    readonly kind: ErrorKind,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

const CORE_ERROR_KINDS = {
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CURSOR: 'VALIDATION',
  TENANT_CONTEXT_MISSING: 'INTERNAL',
} as const satisfies Record<string, ErrorKind>;

export type CoreErrorCode = keyof typeof CORE_ERROR_KINDS;

export class CoreError extends AppError<CoreErrorCode> {
  constructor(code: CoreErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, CORE_ERROR_KINDS[code], message, details);
  }
}
