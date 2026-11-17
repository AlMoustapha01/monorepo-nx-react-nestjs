import type { RequestContext } from '@nx-react-nestjs/api-core';
import type { AuditEntry } from '../../domain/audit-entry';
import { AuditLog, type AuditLogPage, type AuditLogQuery } from '../audit-log';

/** Fake pour les tests unitaires : même filtrage par tenant et même ordre que le repository Drizzle. */
export class InMemoryAuditLog extends AuditLog {
  private readonly entries: AuditEntry[] = [];

  constructor(private readonly context: RequestContext) {
    super();
  }

  async append(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
  }

  async list({ limit, after, actorId, action }: AuditLogQuery): Promise<AuditLogPage> {
    const tenantId = this.context.tenantId;
    const key = (entry: AuditEntry) => `${entry.occurredAt.toISOString()} ${entry.id}`;
    const rows = this.entries
      .filter((entry) => entry.tenantId === tenantId)
      .filter((entry) => !actorId || entry.actorId === actorId)
      .filter((entry) => !action || entry.action === action)
      .filter((entry) => !after || key(entry) < `${after.createdAt.toISOString()} ${after.id}`)
      .sort((a, b) => key(b).localeCompare(key(a)));
    return { items: rows.slice(0, limit), hasMore: rows.length > limit };
  }

  all(): AuditEntry[] {
    return [...this.entries];
  }
}
