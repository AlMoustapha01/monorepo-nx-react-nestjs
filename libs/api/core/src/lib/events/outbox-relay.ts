import { Injectable } from '@nestjs/common';
import { asc, inArray, isNull } from 'drizzle-orm';
import { DatabaseSession } from '../database/database-session';
import { IntegrationEventRegistry } from './integration-event.registry';
import { enqueueIntegrationEvent } from './job-queue';
import { outbox } from './messaging.schema';

const BATCH_SIZE = 100;

/**
 * Met en file les événements restés non publiés : ceux qu'écrit encore une ancienne version
 * pendant un déploiement (relais BullMQ, ADR 0005), ou une ligne oubliée. `Outbox.publish` met
 * déjà ses jobs en file : en temps normal, il n'y a rien à relayer.
 * Plusieurs workers peuvent tourner en parallèle : `SKIP LOCKED` répartit les lignes, et la clé du
 * job écarte un doublon. Ne filtre pas par tenant : c'est de l'infrastructure.
 */
@Injectable()
export class OutboxRelay {
  constructor(
    private readonly session: DatabaseSession,
    private readonly registry: IntegrationEventRegistry,
  ) {}

  /** Relaie tout ce qui est en attente ; renvoie le nombre d'événements relayés. */
  async relayPending(): Promise<number> {
    let total = 0;
    for (;;) {
      const relayed = await this.relayBatch();
      total += relayed;
      if (relayed < BATCH_SIZE) {
        return total;
      }
    }
  }

  private relayBatch(): Promise<number> {
    return this.session.transaction(async () => {
      const rows = await this.session.db
        .select()
        .from(outbox)
        .where(isNull(outbox.publishedAt))
        .orderBy(asc(outbox.occurredAt))
        .limit(BATCH_SIZE)
        .for('update', { skipLocked: true });
      if (rows.length === 0) {
        return 0;
      }

      for (const row of rows) {
        for (const handler of this.registry.handlersFor(row.type)) {
          await enqueueIntegrationEvent(this.session.db, {
            handler: handler.name,
            event: {
              id: row.id,
              type: row.type,
              tenantId: row.tenantId,
              actorId: row.actorId,
              occurredAt: row.occurredAt.toISOString(),
              payload: row.payload,
            },
            ...(row.traceContext && { traceContext: row.traceContext }),
          });
        }
      }

      await this.session.db
        .update(outbox)
        .set({ publishedAt: new Date() })
        .where(
          inArray(
            outbox.id,
            rows.map((row) => row.id),
          ),
        );
      return rows.length;
    });
  }
}
