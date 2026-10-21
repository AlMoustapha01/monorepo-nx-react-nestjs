import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { type BatchObservableCallback, metrics } from '@opentelemetry/api';
import type { Queue } from 'bullmq';
import { asc, count, inArray, isNull, min } from 'drizzle-orm';
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

  private readonly meter = metrics.getMeter('api-core.messaging');
  private readonly pendingEvents = this.meter.createObservableGauge('outbox.pending_events', {
    description: 'Événements pas encore relayés vers BullMQ',
  });
  private readonly oldestPendingAge = this.meter.createObservableGauge(
    'outbox.oldest_pending_age',
    {
      unit: 's',
      description: 'Âge du plus ancien événement non relayé : le retard du relais',
    },
  );
  private readonly observeOutbox: BatchObservableCallback = async (result) => {
    const [row] = await this.session.db
      .select({ pending: count(), oldest: min(outbox.occurredAt) })
      .from(outbox)
      .where(isNull(outbox.publishedAt));
    result.observe(this.pendingEvents, row?.pending ?? 0);
    result.observe(
      this.oldestPendingAge,
      row?.oldest ? Math.max(0, (Date.now() - row.oldest.getTime()) / 1000) : 0,
    );
  };

  constructor(
    private readonly session: DatabaseSession,
    private readonly registry: IntegrationEventRegistry,
    private readonly config: AppConfig,
    @InjectIntegrationEventsQueue() private readonly queue: Queue<IntegrationEventJob>,
  ) {}

  onApplicationBootstrap(): void {
    if (this.config.get('JOBS_ENABLED')) {
      this.schedule(0);
      this.meter.addBatchObservableCallback(this.observeOutbox, [
        this.pendingEvents,
        this.oldestPendingAge,
      ]);
    }
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.stopped = true;
    this.meter.removeBatchObservableCallback(this.observeOutbox, [
      this.pendingEvents,
      this.oldestPendingAge,
    ]);
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
