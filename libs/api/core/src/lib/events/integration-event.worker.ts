import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { performance } from 'node:perf_hooks';
import { type BatchObservableCallback, metrics } from '@opentelemetry/api';
import { and, eq, lt, sql } from 'drizzle-orm';
import {
  type Job,
  makeWorkerUtils,
  run,
  type Runner,
  type TaskList,
  type WorkerUtils,
} from 'graphile-worker';
import { Pool } from 'pg';
import { AppConfig } from '../config/app-config';
import { RequestContext } from '../context/request-context';
import { DatabaseSession } from '../database/database-session';
// option:sentry:start
import { reportError } from '../errors/error-reporter';
// option:sentry:end
import { idempotencyKeys } from '../http/idempotency/idempotency.schema';
import type { IntegrationEvent } from './integration-event';
import { graphileLogger } from './graphile-logger';
import { IntegrationEventRegistry } from './integration-event.registry';
import {
  INTEGRATION_EVENT_TASK,
  type IntegrationEventJob,
  MESSAGING_CLEANUP_TASK,
  MESSAGING_CRONTAB,
  RELAY_PENDING_TASK,
} from './job-queue';
import { outbox, processedEvents } from './messaging.schema';
import { OutboxRelay } from './outbox-relay';
import { inHandlerSpan } from './trace-context';

const DAY_MS = 24 * 3600 * 1000;
const OUTBOX_RETENTION_MS = 7 * DAY_MS;
/** Bien au-delà de la fenêtre de retries : un doublon tardif reste détecté. */
const PROCESSED_RETENTION_MS = 30 * DAY_MS;
const FAILED_JOBS_RETENTION_MS = 7 * DAY_MS;
const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed'] as const;

/** Rejouer ne servirait à rien (payload invalide) : le job est abandonné tout de suite. */
class AbandonedJobError extends Error {}

type QueueRow = Record<(typeof QUEUE_STATES)[number], number> & { oldest: number | null };

/** Exécute les handlers, au nom du tenant et de l'utilisateur à l'origine de l'événement. */
@Injectable()
export class IntegrationEventWorker implements OnApplicationBootstrap, BeforeApplicationShutdown {
  private readonly logger = new Logger(IntegrationEventWorker.name);
  private pool?: Pool;
  private runner?: Runner;
  private utils?: WorkerUtils;

  // Créés à la construction du provider, donc après le démarrage du SDK (instrumentation.ts).
  private readonly meter = metrics.getMeter('api-core.messaging');
  private readonly handlerDuration = this.meter.createHistogram(
    'integration_events.handler.duration',
    { unit: 's', description: 'Durée d’exécution d’un handler, par handler et par issue' },
  );
  private readonly jobsExhausted = this.meter.createCounter('integration_events.jobs.exhausted', {
    description: 'Jobs abandonnés (retries épuisés ou erreur définitive) : à surveiller',
  });
  private readonly queueJobs = this.meter.createObservableGauge('integration_events.queue.jobs', {
    description: 'Jobs d’événements dans la file, par état',
  });
  private readonly oldestWaitingAge = this.meter.createObservableGauge(
    'integration_events.queue.oldest_waiting_age',
    {
      unit: 's',
      description: 'Âge du plus ancien job prêt et pas encore pris : le retard du traitement',
    },
  );
  private readonly observeQueue: BatchObservableCallback = async (result) => {
    const { rows } = await this.session.db.execute<QueueRow>(sql`
      select
        count(*) filter (where locked_at is not null)::int as active,
        count(*) filter (where locked_at is null and attempts >= max_attempts)::int as failed,
        count(*) filter (where locked_at is null and attempts < max_attempts and run_at > now())::int as delayed,
        count(*) filter (where locked_at is null and attempts < max_attempts and run_at <= now())::int as waiting,
        extract(epoch from now() - min(run_at) filter (
          where locked_at is null and attempts < max_attempts and run_at <= now()
        ))::float as oldest
      from graphile_worker.jobs
      where task_identifier = ${INTEGRATION_EVENT_TASK}
    `);
    const row = rows[0];
    for (const state of QUEUE_STATES) {
      result.observe(this.queueJobs, row?.[state] ?? 0, { state });
    }
    result.observe(this.oldestWaitingAge, Math.max(0, row?.oldest ?? 0));
  };

  constructor(
    private readonly registry: IntegrationEventRegistry,
    private readonly relay: OutboxRelay,
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
    private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.get('JOBS_ENABLED')) {
      return;
    }
    const concurrency = this.config.get('JOBS_CONCURRENCY');
    // Pool à part : LISTEN garde une connexion, et les jobs ne prennent pas celles des requêtes.
    this.pool = new Pool({
      connectionString: this.config.get('DATABASE_URL'),
      max: concurrency + 2,
      // Principe 4 : aucune requête ni attente de connexion sans limite.
      connectionTimeoutMillis: 5_000,
      statement_timeout: this.config.get('DATABASE_STATEMENT_TIMEOUT_MS'),
    });
    // Sans écouteur, une connexion coupée par le serveur (redémarrage, bascule) fait planter le
    // process : sur le pool (connexion inactive) comme sur chaque client (celle de LISTEN).
    const onLost = (error: Error) => this.logger.warn({ err: error }, 'Job queue connection lost');
    this.pool.on('error', onLost);
    this.pool.on('connect', (client) => client.on('error', onLost));

    const logger = graphileLogger(new Logger('GraphileWorker'));
    this.utils = await makeWorkerUtils({ pgPool: this.pool, logger });
    this.runner = await run({
      pgPool: this.pool,
      concurrency,
      pollInterval: this.config.get('JOBS_POLL_INTERVAL_MS'),
      // Nest gère les signaux (closeOnSignal) et appelle beforeApplicationShutdown.
      noHandleSignals: true,
      logger,
      taskList: this.taskList(),
      crontab: MESSAGING_CRONTAB,
    });
    this.runner.events.on('job:error', ({ job, error }) => {
      if (job.attempts < job.max_attempts) {
        this.logger.warn(
          { jobId: job.id, attempt: job.attempts, err: error },
          'Integration event job failed, will retry',
        );
      }
    });
    this.runner.events.on('job:failed', ({ job, error }) => this.onExhausted(job, error));
    this.meter.addBatchObservableCallback(this.observeQueue, [
      this.queueJobs,
      this.oldestWaitingAge,
    ]);
  }

  async beforeApplicationShutdown(): Promise<void> {
    if (!this.runner) {
      return;
    }
    this.meter.removeBatchObservableCallback(this.observeQueue, [
      this.queueJobs,
      this.oldestWaitingAge,
    ]);
    // Laisse finir les jobs en cours avant de fermer la base.
    await this.runner.stop();
    await this.utils?.release();
    await this.pool?.end();
  }

  /** Exécute un job d'événement ; une erreur le fait réessayer. */
  async process(job: IntegrationEventJob): Promise<void> {
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

  /** Met en file les événements restés non publiés (déploiement depuis une ancienne version). */
  async relayPending(): Promise<void> {
    const relayed = await this.relay.relayPending();
    if (relayed > 0) {
      this.logger.log({ relayed }, 'Relayed unpublished integration events');
    }
  }

  private taskList(): TaskList {
    return {
      [INTEGRATION_EVENT_TASK]: async (payload, helpers) => {
        const job = payload as IntegrationEventJob;
        try {
          await this.process(job);
        } catch (error) {
          if (!(error instanceof AbandonedJobError)) {
            throw error;
          }
          // Terminé sans retry ; l'événement reste dans l'outbox (7 jours) pour un rejeu manuel.
          this.onExhausted(helpers.job, error);
        }
      },
      [MESSAGING_CLEANUP_TASK]: () => this.cleanup(),
      [RELAY_PENDING_TASK]: () => this.relayPending(),
    };
  }

  private onExhausted(job: Job, error: unknown): void {
    const data = job.payload as Partial<IntegrationEventJob> | undefined;
    const handler = data?.handler ?? job.task_identifier;
    this.jobsExhausted.add(1, { 'app.event.handler': handler });
    this.logger.error(
      { jobId: job.id, attempt: job.attempts, err: error },
      'Integration event job abandoned',
    );
    // option:sentry:start
    // Un échec suivi d'un retry réussi n'est pas un incident : seuls les abandons vont à Sentry.
    reportError(error, {
      tags: { handler, event_id: data?.event?.id, tenant_id: data?.event?.tenantId },
      userId: data?.event?.actorId,
    });
    // option:sentry:end
  }

  private async dispatch({ handler: name, event }: IntegrationEventJob): Promise<void> {
    const handler = this.registry.handler(name);
    if (!handler) {
      // Retry, pas d'abandon : l'API met les jobs en file, et pendant un déploiement un ancien
      // worker peut recevoir celui d'un handler qu'il n'a pas encore. Un nom retiré s'épuise.
      throw new Error(`No integration event handler named "${name}"`);
    }
    const parsed = handler.definition.schema.safeParse(event.payload);
    if (!parsed.success) {
      throw new AbandonedJobError(`Invalid payload for ${event.type}: ${parsed.error.message}`);
    }

    const run = () => handler.instance.handle({ ...event, payload: parsed.data });
    const principal = {
      tenantId: event.tenantId,
      userId: event.actorId,
      ...(event.impersonatorId && { impersonatorId: event.impersonatorId }),
    };
    await this.context.runAs(principal, () =>
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

  /** Purge quotidienne des tables techniques et des jobs abandonnés. */
  async cleanup(): Promise<void> {
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
    // Jobs en échec définitif : gardés 7 jours pour enquête, comme l'étaient ceux de BullMQ.
    const { rows } = await this.session.db.execute<{ id: string }>(sql`
      select id::text from graphile_worker.jobs
      where attempts >= max_attempts and locked_at is null
        and updated_at < ${new Date(now - FAILED_JOBS_RETENTION_MS)}
    `);
    if (rows.length > 0) {
      await this.utils?.completeJobs(rows.map((row) => row.id));
    }
  }
}
