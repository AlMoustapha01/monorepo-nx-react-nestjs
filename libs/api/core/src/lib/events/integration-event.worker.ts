import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { type BatchObservableCallback, metrics, type ObservableGauge } from '@opentelemetry/api';
import { type Job, type Queue, UnrecoverableError, Worker } from 'bullmq';
import { and, eq, lt } from 'drizzle-orm';
import { AppConfig } from '../config/app-config';
import { RequestContext } from '../context/request-context';
import { DatabaseSession } from '../database/database-session';
import type { IntegrationEvent } from './integration-event';
import { IntegrationEventRegistry } from './integration-event.registry';
import {
  INTEGRATION_EVENTS_QUEUE_NAME,
  InjectIntegrationEventsQueue,
  type IntegrationEventJob,
  MESSAGING_CLEANUP_JOB,
  redisConnection,
} from './integration-event.queue';
import { idempotencyKeys } from '../http/idempotency/idempotency.schema';
import { outbox, processedEvents } from './messaging.schema';
import { inHandlerSpan } from './trace-context';

const DAY_MS = 24 * 3600 * 1000;
const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;
const OUTBOX_RETENTION_MS = 7 * DAY_MS;
/** Bien au-delà de la fenêtre de retries : un doublon tardif reste détecté. */
const PROCESSED_RETENTION_MS = 30 * DAY_MS;

/** Exécute les handlers, au nom du tenant et de l'utilisateur à l'origine de l'événement. */
@Injectable()
export class IntegrationEventWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(IntegrationEventWorker.name);
  private worker?: Worker<IntegrationEventJob>;

  // Créés à la construction du provider, donc après le démarrage du SDK (instrumentation.ts).
  private readonly meter = metrics.getMeter('api-core.messaging');
  private readonly handlerDuration = this.meter.createHistogram(
    'integration_events.handler.duration',
    { unit: 's', description: 'Durée d’exécution d’un handler, par handler et par issue' },
  );
  private readonly jobsExhausted = this.meter.createCounter('integration_events.jobs.exhausted', {
    description: 'Jobs abandonnés (retries épuisés ou erreur définitive) : à surveiller',
  });
  private readonly queueJobs: ObservableGauge = this.meter.createObservableGauge(
    'integration_events.queue.jobs',
    { description: 'Jobs dans la file BullMQ, par état' },
  );
  private readonly observeQueue: BatchObservableCallback = async (result) => {
    const counts = await this.queue.getJobCounts(...QUEUE_STATES);
    for (const state of QUEUE_STATES) {
      result.observe(this.queueJobs, counts[state] ?? 0, { state });
    }
  };

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
    this.worker.on('failed', (job, error) => this.onFailed(job, error));
    this.meter.addBatchObservableCallback(this.observeQueue, [this.queueJobs]);
  }

  private onFailed(job: Job<IntegrationEventJob> | undefined, error: Error): void {
    const exhausted =
      error instanceof UnrecoverableError || (job?.attemptsMade ?? 0) >= (job?.opts.attempts ?? 1);
    const details = { jobId: job?.id, attempt: job?.attemptsMade, err: error };
    if (!exhausted) {
      this.logger.warn(details, 'Integration event job failed, will retry');
      return;
    }
    this.jobsExhausted.add(1, { 'app.event.handler': job?.data.handler ?? job?.name ?? 'unknown' });
    this.logger.error(details, 'Integration event job abandoned');
  }

  async beforeApplicationShutdown(): Promise<void> {
    this.meter.removeBatchObservableCallback(this.observeQueue, [this.queueJobs]);
    // Laisse finir les jobs en cours avant de fermer la base.
    await this.worker?.close();
  }

  process(job: Pick<Job<IntegrationEventJob>, 'name' | 'data'>): Promise<void> {
    return job.name === MESSAGING_CLEANUP_JOB ? this.cleanup() : this.handle(job.data);
  }

  private async handle(job: IntegrationEventJob): Promise<void> {
    const started = performance.now();
    let outcome = 'success';
    try {
      await inHandlerSpan(job, () => this.dispatch(job));
    } catch (error) {
      outcome = 'error';
      throw error;
    } finally {
      this.handlerDuration.record((performance.now() - started) / 1000, {
        'app.event.handler': job.handler,
        outcome,
      });
    }
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

    const run = () => handler.instance.handle({ ...event, payload: parsed.data });
    await this.context.runAs({ tenantId: event.tenantId, userId: event.actorId }, () =>
      handler.transactional === false
        ? this.runOutsideTransaction(name, event, run)
        : this.runInTransaction(name, event, run),
    );
  }

  /** Marque et traitement validés ensemble : effet en base exactement une fois. */
  private runInTransaction(
    name: string,
    event: IntegrationEvent,
    run: () => Promise<void>,
  ): Promise<void> {
    return this.session.transaction(async () => {
      if (!(await this.markProcessed(name, event))) {
        return;
      }
      // En cas d'échec, la transaction annule aussi la marque : le retry retraitera l'événement.
      await run();
    });
  }

  /** Aucune connexion gardée pendant l'appel externe ; la marque n'est posée qu'après succès. */
  private async runOutsideTransaction(
    name: string,
    event: IntegrationEvent,
    run: () => Promise<void>,
  ): Promise<void> {
    const [processed] = await this.session.db
      .select({ eventId: processedEvents.eventId })
      .from(processedEvents)
      .where(and(eq(processedEvents.handler, name), eq(processedEvents.eventId, event.id)))
      .limit(1);
    if (processed) {
      return;
    }
    await run();
    await this.markProcessed(name, event);
  }

  /** Renvoie false si l'événement était déjà marqué pour ce handler. */
  private async markProcessed(name: string, event: IntegrationEvent): Promise<boolean> {
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
    return claimed !== undefined;
  }

  private async cleanup(): Promise<void> {
    const now = Date.now();
    await this.session.db
      .delete(outbox)
      .where(lt(outbox.publishedAt, new Date(now - OUTBOX_RETENTION_MS)));
    await this.session.db
      .delete(processedEvents)
      .where(lt(processedEvents.processedAt, new Date(now - PROCESSED_RETENTION_MS)));
    // Le même job quotidien purge les autres tables techniques d'api-core.
    await this.session.db
      .delete(idempotencyKeys)
      .where(lt(idempotencyKeys.expiresAt, new Date(now)));
  }
}
