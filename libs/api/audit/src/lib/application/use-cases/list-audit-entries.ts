import { Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor } from '@nx-react-nestjs/api-core';
import type { AuditPageQuery, CursorPage } from '@nx-react-nestjs/contracts';
import type { AuditEntry } from '../../domain/audit-entry';
import { AuditLog } from '../audit-log';

/** Réservé au staff du tenant (`@RequireRole('staff')` sur la route) : le journal concerne tout le tenant. */
@Injectable()
export class ListAuditEntries {
  constructor(private readonly log: AuditLog) {}

  async execute({
    limit,
    cursor,
    actorId,
    action,
  }: AuditPageQuery): Promise<CursorPage<AuditEntry>> {
    const page = await this.log.list({
      limit,
      after: cursor ? decodeCursor(cursor) : undefined,
      actorId,
      action,
    });
    const last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor:
        page.hasMore && last ? encodeCursor({ createdAt: last.occurredAt, id: last.id }) : null,
    };
  }
}
