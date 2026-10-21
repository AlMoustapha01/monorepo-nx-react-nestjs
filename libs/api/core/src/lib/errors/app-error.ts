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
  /** La copie du client n'est plus à jour (`If-Match` ne correspond plus). */
  | 'PRECONDITION_FAILED'
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
  FORBIDDEN: 'FORBIDDEN',
  /** Route derrière un flag désactivé : on ne révèle pas qu'elle existe. */
  FEATURE_DISABLED: 'NOT_FOUND',
  INVALID_CURSOR: 'VALIDATION',
  TENANT_CONTEXT_MISSING: 'INTERNAL',
  OUTBOX_REQUIRES_TRANSACTION: 'INTERNAL',
  INVALID_IF_MATCH: 'VALIDATION',
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  IDEMPOTENCY_KEY_REQUIRED: 'VALIDATION',
  INVALID_IDEMPOTENCY_KEY: 'VALIDATION',
  /** 422, comme le recommande le brouillon IETF « The Idempotency-Key HTTP Header Field ». */
  IDEMPOTENCY_KEY_REUSED: 'BUSINESS_RULE',
} as const satisfies Record<string, ErrorKind>;

export type CoreErrorCode = keyof typeof CORE_ERROR_KINDS;

export class CoreError extends AppError<CoreErrorCode> {
  constructor(code: CoreErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, CORE_ERROR_KINDS[code], message, details);
  }
}
