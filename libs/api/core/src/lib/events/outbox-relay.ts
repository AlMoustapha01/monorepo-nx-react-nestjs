import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import type { Queue } from 'bullmq';
import { asc, inArray, isNull } from 'drizzle-orm';
import { AppConfig } from '../config/app-config';
import { DatabaseSession } from '../database/database-session';
import { IntegrationEventRegistry } from './integration-event.registry';
import {
  InjectIntegrationEventsQueue,
  type IntegrationEventJob,
  jobIdFor,
} from './integration-event.queue';
import { outbox } from './messaging.schema';

const BATCH_SIZE = 100;

/**
 * Lit l'outbox et pousse un job par (événement, handler) dans BullMQ.
 * Plusieurs instances peuvent tourner en parallèle : `SKIP LOCKED` répartit les lignes.
 * Ne filtre pas par tenant : c'est de l'infrastructure, elle traite tous les tenants.
 */
@Injectable()
export class OutboxRelay implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(OutboxRelay.name);
  private timer?: NodeJS.Timeout;
  private running?: Promise<void>;
  private stopped = false;

  constructor(
    private readonly session: DatabaseSession,
    private readonly registry: IntegrationEventRegistry,
    private readonly config: AppConfig,
    @InjectIntegrationEventsQueue() private readonly queue: Queue<IntegrationEventJob>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('JOBS_ENABLED')) {
      this.schedule(0);
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.running;
  }

  /** Relaie un lot ; renvoie le nombre d'événements traités. */
  relayBatch(): Promise<number> {
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

      const jobs = rows.flatMap((row) =>
        this.registry.handlersFor(row.type).map((handler) => ({
          name: handler.name,
          data: {
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
          },
          // Même ID si le lot est rejoué après un crash : BullMQ ignore le doublon.
          opts: { jobId: jobIdFor(row.id, handler.name) },
        })),
      );
      if (jobs.length > 0) {
        await this.queue.addBulk(jobs);
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

  private schedule(delayMs: number): void {
    if (this.stopped) {
      return;
    }
    this.timer = setTimeout(() => {
      this.running = this.tick();
    }, delayMs);
  }

  private async tick(): Promise<void> {
    let relayed = 0;
    try {
      relayed = await this.relayBatch();
    } catch (error) {
      this.logger.error(error);
    }
    // Lot plein : il en reste probablement, on enchaîne sans attendre.
    this.schedule(relayed === BATCH_SIZE ? 0 : this.config.get('OUTBOX_POLL_INTERVAL_MS'));
  }
}
