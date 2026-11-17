import { AppError, type ErrorKind } from '@nx-react-nestjs/api-core';

/** Codes stables exposés aux clients ; la catégorie décide du statut HTTP. */
const AUDIT_ERROR_KINDS = {
  /** Action mal nommée ou détails qui ne sont pas des valeurs simples : un bug de l'appelant. */
  INVALID_AUDIT_ENTRY: 'VALIDATION',
} as const satisfies Record<string, ErrorKind>;

export type AuditErrorCode = keyof typeof AUDIT_ERROR_KINDS;

export class AuditError extends AppError<AuditErrorCode> {
  constructor(code: AuditErrorCode, message: string, details?: Record<string, unknown>) {
    super(code, AUDIT_ERROR_KINDS[code], message, details);
  }
}
