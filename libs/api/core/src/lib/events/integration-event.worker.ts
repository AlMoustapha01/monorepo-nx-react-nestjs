import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { type Job, type Queue, UnrecoverableError, Worker } from 'bullmq';
import { lt } from 'drizzle-orm';
import { AppConfig } from '../config/app-config';
import { RequestContext } from '../context/request-context';
import { DatabaseSession } from '../database/database-session';
import { IntegrationEventRegistry } from './integration-event.registry';
import {
  INTEGRATION_EVENTS_QUEUE_NAME,
  InjectIntegrationEventsQueue,
  type IntegrationEventJob,
  MESSAGING_CLEANUP_JOB,
  redisConnection,
} from './integration-event.queue';
import { outbox, processedEvents } from './messaging.schema';

const DAY_MS = 24 * 3600 * 1000;
const OUTBOX_RETENTION_MS = 7 * DAY_MS;
/** Bien au-delà de la fenêtre de retries : un doublon tardif reste détecté. */
const PROCESSED_RETENTION_MS = 30 * DAY_MS;

/** Exécute les handlers, au nom du tenant et de l'utilisateur à l'origine de l'événement. */
@Injectable()
export class IntegrationEventWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(IntegrationEventWorker.name);
  private worker?: Worker<IntegrationEventJob>;

  constructor(
    private readonly registry: IntegrationEventRegistry,
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
    private readonly config: AppConfig,
    @InjectIntegrationEventsQueue() private readonly queue: Queue<IntegrationEventJob>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('JOBS_ENABLED')) {
      return;
    }
    await this.queue.upsertJobScheduler(
      MESSAGING_CLEANUP_JOB,
      { pattern: '0 3 * * *' },
      { name: MESSAGING_CLEANUP_JOB },
    );
    this.worker = new Worker<IntegrationEventJob>(
      INTEGRATION_EVENTS_QUEUE_NAME,
      (job) => this.process(job),
      {
        connection: redisConnection(this.config.get('REDIS_URL')),
        concurrency: this.config.get('JOBS_CONCURRENCY'),
      },
    );
    this.worker.on('failed', (job, error) =>
      this.logger.warn(
        { jobId: job?.id, attempt: job?.attemptsMade, err: error },
        'Integration event job failed',
      ),
    );
  }

  async beforeApplicationShutdown(): Promise<void> {
    // Laisse finir les jobs en cours avant de fermer la base.
    await this.worker?.close();
  }

  process(job: Pick<Job<IntegrationEventJob>, 'name' | 'data'>): Promise<void> {
    return job.name === MESSAGING_CLEANUP_JOB ? this.cleanup() : this.dispatch(job.data);
  }

  private async dispatch({ handler: name, event }: IntegrationEventJob): Promise<void> {
    const handler = this.registry.handler(name);
    if (!handler) {
      throw new UnrecoverableError(`No integration event handler named "${name}"`);
    }
    const parsed = handler.definition.schema.safeParse(event.payload);
    if (!parsed.success) {
      // Rejouer ne corrigera pas un payload invalide.
      throw new UnrecoverableError(`Invalid payload for ${event.type}: ${parsed.error.message}`);
    }

    await this.context.runAs({ tenantId: event.tenantId, userId: event.actorId }, () =>
      this.session.transaction(async () => {
        const [claimed] = await this.session.db
          .insert(processedEvents)
          .values({
            handler: name,
            eventId: event.id,
            tenantId: event.tenantId,
            processedAt: new Date(),
          })
          .onConflictDoNothing()
          .returning({ eventId: processedEvents.eventId });
        if (!claimed) {
          return;
        }
        // En cas d'échec, la transaction annule aussi la marque : le retry retraitera l'événement.
        await handler.instance.handle({ ...event, payload: parsed.data });
      }),
    );
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    await this.session.db
      .delete(outbox)
      .where(lt(outbox.publishedAt, new Date(now - OUTBOX_RETENTION_MS)));
    await this.session.db
      .delete(processedEvents)
      .where(lt(processedEvents.processedAt, new Date(now - PROCESSED_RETENTION_MS)));
  }
}
