import { sql } from 'drizzle-orm';
import type { Database } from '../database/database.tokens';
import type { IntegrationEvent } from './integration-event';

/** Tâches Graphile Worker de la messagerie (une crontab n'accepte pas de point dans un nom). */
export const INTEGRATION_EVENT_TASK = 'integration-event';
export const MESSAGING_CLEANUP_TASK = 'messaging:cleanup';
export const RELAY_PENDING_TASK = 'messaging:relay-pending';

/** Purge quotidienne à 3 h ; rattrapage des événements non publiés chaque minute. */
export const MESSAGING_CRONTAB = [
  `0 3 * * * ${MESSAGING_CLEANUP_TASK}`,
  `* * * * * ${RELAY_PENDING_TASK}`,
].join('\n');

/** Avec le backoff de Graphile (e^n s), environ 3 h 30 de retries cumulés avant l'abandon. */
const MAX_ATTEMPTS = 10;

/** Données d'un job : un événement, pour un handler. */
export interface IntegrationEventJob {
  handler: string;
  event: IntegrationEvent;
  /** Absent sans OpenTelemetry. */
  traceContext?: Record<string, string>;
}

/** Un couple (événement, handler) n'est mis en file qu'une fois, même rejoué. */
const jobKeyFor = (eventId: string, handler: string) => `${eventId}:${handler}`;

/**
 * Met un job en file par SQL : dans la transaction en cours si `db` en est une, donc validé ou
 * annulé avec l'écriture métier. `unsafe_dedupe` : un job de même clé déjà présent est gardé tel quel.
 */
export async function enqueueIntegrationEvent(
  db: Pick<Database, 'execute'>,
  job: IntegrationEventJob,
): Promise<void> {
  await db.execute(sql`
    select graphile_worker.add_job(
      ${INTEGRATION_EVENT_TASK},
      ${JSON.stringify(job)}::json,
      max_attempts => ${MAX_ATTEMPTS}::int,
      job_key => ${jobKeyFor(job.event.id, job.handler)},
      job_key_mode => 'unsafe_dedupe'
    )
  `);
}
