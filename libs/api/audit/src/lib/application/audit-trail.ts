import { Injectable } from '@nestjs/common';
import { RequestContext } from '@nx-react-nestjs/api-core';
import {
  AUDIT_ENTRY_ID_PREFIX,
  type AuditDetails,
  type AuditResource,
  domainIdGenerator,
} from '@nx-react-nestjs/contracts';
import { trace } from '@opentelemetry/api';
import { AuditEntry } from '../domain/audit-entry';
import { AuditLog } from './audit-log';

const newAuditEntryId = domainIdGenerator(AUDIT_ENTRY_ID_PREFIX);

export interface AuditRecord {
  actorId: string | null;
  action: string;
  resource: AuditResource | null;
  details: AuditDetails;
  occurredAt: Date;
}

/** Écrit une ligne au nom du tenant courant, avec la trace en cours (celle de la requête d'origine). */
@Injectable()
export class AuditTrail {
  constructor(
    private readonly log: AuditLog,
    private readonly context: RequestContext,
  ) {}

  async record(record: AuditRecord): Promise<void> {
    await this.log.append(
      AuditEntry.record({
        ...record,
        id: newAuditEntryId(),
        tenantId: this.context.tenantId,
        impersonatorId: this.context.impersonatorId ?? null,
        traceId: trace.getActiveSpan()?.spanContext().traceId ?? null,
      }),
    );
  }
}
