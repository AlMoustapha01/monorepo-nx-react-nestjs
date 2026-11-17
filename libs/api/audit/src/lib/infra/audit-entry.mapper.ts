import { PersistenceMapper } from '@nx-react-nestjs/api-core';
import { AuditEntry } from '../domain/audit-entry';
import type { AuditEntryRow } from './audit.schema';

export class AuditEntryMapper extends PersistenceMapper<AuditEntry, AuditEntryRow> {
  toDomain(row: AuditEntryRow): AuditEntry {
    return AuditEntry.restore({
      id: row.id,
      tenantId: row.tenantId,
      actorId: row.actorId,
      impersonatorId: row.impersonatorId,
      action: row.action,
      resource:
        row.resourceType && row.resourceId ? { type: row.resourceType, id: row.resourceId } : null,
      details: row.details,
      occurredAt: row.occurredAt,
      traceId: row.traceId,
    });
  }

  toRow(entry: AuditEntry): AuditEntryRow {
    return {
      id: entry.id,
      tenantId: entry.tenantId,
      actorId: entry.actorId,
      impersonatorId: entry.impersonatorId,
      action: entry.action,
      resourceType: entry.resource?.type ?? null,
      resourceId: entry.resource?.id ?? null,
      details: entry.details,
      occurredAt: entry.occurredAt,
      traceId: entry.traceId,
    };
  }
}
