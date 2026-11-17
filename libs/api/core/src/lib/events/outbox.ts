import { Injectable } from '@nestjs/common';
import type {
  IntegrationEventDefinition,
  IntegrationEventPayload,
} from '@nx-react-nestjs/contracts';
import { RequestContext } from '../context/request-context';
import { DatabaseSession } from '../database/database-session';
import { CoreError } from '../errors/app-error';
import { domainIdGenerator } from '../ids/domain-id';
import { IntegrationEventRegistry } from './integration-event.registry';
import { enqueueIntegrationEvent } from './job-queue';
import { outbox } from './messaging.schema';
import { captureTraceContext } from './trace-context';

/**
 * Publication d'événements d'intégration, à appeler dans la transaction de l'écriture métier :
 * l'événement et un job par handler abonné sont validés ou annulés avec elle.
 */
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
    private readonly registry: IntegrationEventRegistry,
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
    const occurredAt = new Date();
    const event = {
      id: newEventId(),
      type: definition.type,
      tenantId: this.context.tenantId,
      actorId: this.context.userId,
      ...(this.context.impersonatorId && { impersonatorId: this.context.impersonatorId }),
      occurredAt: occurredAt.toISOString(),
      payload: definition.schema.parse(payload),
    };
    const traceContext = captureTraceContext();

    // Journal des événements ; publié dès l'écriture, puisque ses jobs partent avec la transaction.
    await this.session.db.insert(outbox).values({
      ...event,
      occurredAt,
      publishedAt: occurredAt,
      traceContext,
    });
    for (const handler of this.registry.handlersFor(definition.type)) {
      await enqueueIntegrationEvent(this.session.db, {
        handler: handler.name,
        event,
        ...(traceContext && { traceContext }),
      });
    }
  }
}
