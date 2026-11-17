import { Injectable } from '@nestjs/common';
import { DatabaseSession, RequestContext } from '@nx-react-nestjs/api-core';
import { and, desc, eq, type SQL, sql } from 'drizzle-orm';
import { AuditLog, type AuditLogPage, type AuditLogQuery } from '../application/audit-log';
import type { AuditEntry } from '../domain/audit-entry';
import { AuditEntryMapper } from './audit-entry.mapper';
import { auditEntries } from './audit.schema';

@Injectable()
export class DrizzleAuditLog extends AuditLog {
  private readonly mapper = new AuditEntryMapper();

  constructor(
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
  ) {
    super();
  }

  async append(entry: AuditEntry): Promise<void> {
    await this.session.db
      .insert(auditEntries)
      .values({ ...this.mapper.toRow(entry), tenantId: this.context.tenantId });
  }

  async list({ limit, after, actorId, action }: AuditLogQuery): Promise<AuditLogPage> {
    const rows = await this.session.db
      .select()
      .from(auditEntries)
      .where(
        and(
          this.tenantScope(),
          actorId ? eq(auditEntries.actorId, actorId) : undefined,
          action ? eq(auditEntries.action, action) : undefined,
          after &&
            sql`(${auditEntries.occurredAt}, ${auditEntries.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id})`,
        ),
      )
      .orderBy(desc(auditEntries.occurredAt), desc(auditEntries.id))
      .limit(limit + 1);
    return { items: this.mapper.toDomainList(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  /** Toute requête passe par ici : pas de lecture ni d'écriture hors du tenant courant. */
  private tenantScope(): SQL {
    return eq(auditEntries.tenantId, this.context.tenantId);
  }
}
