import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  // option:feature-flags:start
  RequireFeature,
  // option:feature-flags:end
  RequireRole,
} from '@nx-react-nestjs/api-core';
import {
  type AuditEntryResponse,
  auditPageQuerySchema,
  auditPageSchema,
  type CursorPage,
} from '@nx-react-nestjs/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import type { AuditEntry } from '../domain/audit-entry';
import { ListAuditEntries } from '../application/use-cases/list-audit-entries';

class AuditPageQueryDto extends createZodDto(auditPageQuerySchema) {}
class AuditPageDto extends createZodDto(auditPageSchema) {}

/** Couche fine : valider (DTO zod), appeler un cas d'usage, sérialiser. Aucune règle métier ici. */
@ApiTags('audit')
@ApiBearerAuth()
// option:feature-flags:start
@RequireFeature('audit.log')
// option:feature-flags:end
@Controller({ path: 'audit/entries', version: '1' })
export class AuditController {
  constructor(private readonly listEntries: ListAuditEntries) {}

  /** Journal du tenant, plus récentes d'abord ; filtres par acteur et par action. */
  @Get()
  @RequireRole('staff')
  @ZodSerializerDto(AuditPageDto)
  async list(@Query() query: AuditPageQueryDto): Promise<CursorPage<AuditEntryResponse>> {
    const page = await this.listEntries.execute(query);
    return { items: page.items.map(toResponse), nextCursor: page.nextCursor };
  }
}

function toResponse(entry: AuditEntry): AuditEntryResponse {
  return {
    id: entry.id,
    actorId: entry.actorId,
    impersonatorId: entry.impersonatorId,
    action: entry.action,
    resource: entry.resource,
    details: entry.details,
    occurredAt: entry.occurredAt.toISOString(),
    traceId: entry.traceId,
  };
}
