import { Injectable } from '@nestjs/common';
import type {
  IntegrationEventDefinition,
  IntegrationEventPayload,
} from '@nx-react-nestjs/contracts';
import { RequestContext } from '../context/request-context';
import { DatabaseSession } from '../database/database-session';
import { CoreError } from '../errors/app-error';
import { domainIdGenerator } from '../ids/domain-id';
import { outbox } from './messaging.schema';
import { captureTraceContext } from './trace-context';

/** Publication d'événements d'intégration, à appeler dans la transaction de l'écriture métier. */
export abstract class Outbox {
  abstract publish<TDefinition extends IntegrationEventDefinition>(
    definition: TDefinition,
    payload: IntegrationEventPayload<TDefinition>,
  ): Promise<void>;
}

const newEventId = domainIdGenerator('EVT');

@Injectable()
export class DrizzleOutbox extends Outbox {
  constructor(
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
  ) {
    super();
  }

  async publish<TDefinition extends IntegrationEventDefinition>(
    definition: TDefinition,
    payload: IntegrationEventPayload<TDefinition>,
  ): Promise<void> {
    // Hors transaction, l'événement pourrait survivre à une écriture métier annulée.
    if (!this.session.inTransaction) {
      throw new CoreError(
        'OUTBOX_REQUIRES_TRANSACTION',
        `Event ${definition.type} must be published inside a transaction`,
      );
    }
    await this.session.db.insert(outbox).values({
      id: newEventId(),
      tenantId: this.context.tenantId,
      actorId: this.context.userId,
      type: definition.type,
      payload: definition.schema.parse(payload),
      occurredAt: new Date(),
      traceContext: captureTraceContext(),
    });
  }
}
