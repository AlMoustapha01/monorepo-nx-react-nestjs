import { Module } from '@nestjs/common';
import { AuditLog } from './application/audit-log';
import { AuditTrail } from './application/audit-trail';
import { AUDITED_EVENT_HANDLERS } from './application/audited-events';
import { ListAuditEntries } from './application/use-cases/list-audit-entries';
import { AuditController } from './http/audit.controller';
import { DrizzleAuditLog } from './infra/drizzle-audit-log';

/** Journal d'audit : écrit par ses handlers d'événements (et par le service d'identité), lu par le staff. */
@Module({
  controllers: [AuditController],
  providers: [
    { provide: AuditLog, useClass: DrizzleAuditLog },
    AuditTrail,
    ListAuditEntries,
    ...AUDITED_EVENT_HANDLERS,
  ],
})
export class AuditModule {}
