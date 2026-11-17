import type { KeysetCursor } from '@nx-react-nestjs/api-core';
import type { AuditEntry } from '../domain/audit-entry';

export interface AuditLogPage {
  items: AuditEntry[];
  hasMore: boolean;
}

export interface AuditLogQuery {
  limit: number;
  /** Position (occurredAt, id) de la dernière ligne de la page précédente. */
  after?: KeysetCursor;
  actorId?: string;
  action?: string;
}

/** Journal du tenant courant : on y ajoute, on y lit, jamais on n'y modifie. */
export abstract class AuditLog {
  abstract append(entry: AuditEntry): Promise<void>;
  /** Plus récentes d'abord : (occurredAt, id) décroissants. */
  abstract list(query: AuditLogQuery): Promise<AuditLogPage>;
}
