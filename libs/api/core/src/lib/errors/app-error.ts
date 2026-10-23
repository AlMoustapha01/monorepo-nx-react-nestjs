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
  /** Token absent, invalide, expiré, ou sans tenant. */
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  /** Route réservée à un autre rôle (`@RequireRole`) ; `details.required` liste les rôles admis. */
  FORBIDDEN: 'FORBIDDEN',
  /** Route derrière un flag désactivé : on ne révèle pas qu'elle existe. */
  FEATURE_DISABLED: 'NOT_FOUND',
  /** Curseur de pagination illisible ou forgé : repartir de la première page. */
  INVALID_CURSOR: 'VALIDATION',
  /** Bug : tenant ou utilisateur lu hors d'une requête ou d'un handler. */
  TENANT_CONTEXT_MISSING: 'INTERNAL',
  /** Bug : événement publié hors de la transaction de l'écriture métier. */
  OUTBOX_REQUIRES_TRANSACTION: 'INTERNAL',
  /** `If-Match` doit être un seul ETag, comme `"3"`. */
  INVALID_IF_MATCH: 'VALIDATION',
  /** La ressource a changé depuis sa lecture (`If-Match`) : la relire avant de réessayer. */
  PRECONDITION_FAILED: 'PRECONDITION_FAILED',
  /** Route de création sans en-tête `Idempotency-Key`. */
  IDEMPOTENCY_KEY_REQUIRED: 'VALIDATION',
  /** `Idempotency-Key` n'est pas un UUID. */
  INVALID_IDEMPOTENCY_KEY: 'VALIDATION',
  /**
   * Même `Idempotency-Key` pour une requête différente. 422, comme le recommande le brouillon IETF
   * « The Idempotency-Key HTTP Header Field ».
   */
  IDEMPOTENCY_KEY_REUSED: 'BUSINESS_RULE',
} as const satisfies Record<string, ErrorKind>;

export type CoreErrorCode = keyof typeof CORE_ERROR_KINDS;

export class CoreError extends AppError<CoreErrorCode> {
  constructor(code: CoreErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, CORE_ERROR_KINDS[code], message, details);
  }
}
