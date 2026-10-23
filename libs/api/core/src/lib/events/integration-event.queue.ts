import { Inject } from '@nestjs/common';
import type { DefaultJobOptions } from 'bullmq';
import type { IntegrationEvent } from './integration-event';

export const INTEGRATION_EVENTS_QUEUE = Symbol('INTEGRATION_EVENTS_QUEUE');
export const InjectIntegrationEventsQueue = () => Inject(INTEGRATION_EVENTS_QUEUE);

export const INTEGRATION_EVENTS_QUEUE_NAME = 'integration-events';
export const MESSAGING_CLEANUP_JOB = 'messaging.cleanup';

/** Données d'un job : un événement, pour un handler. */
export interface IntegrationEventJob {
  handler: string;
  event: IntegrationEvent;
  /** Absent sans OpenTelemetry. */
  traceContext?: Record<string, string>;
}

export const DEFAULT_JOB_OPTIONS: DefaultJobOptions = {
  // ~8,5 min de retries cumulés (1 s, 2 s, 4 s… 256 s) avant de laisser le job en échec.
  attempts: 10,
  backoff: { type: 'exponential', delay: 1000 },
  // Principe 4 : rien ne reste indéfiniment dans Redis.
  removeOnComplete: { age: 24 * 3600, count: 10_000 },
  removeOnFail: { age: 7 * 24 * 3600 },
};

/** BullMQ exige `maxRetriesPerRequest: null` pour les connexions bloquantes des workers. */
export const redisConnection = (url: string) => ({ url, maxRetriesPerRequest: null });

/** `:` est interdit dans un ID de job BullMQ. */
export const jobIdFor = (eventId: string, handler: string) => `${eventId}__${handler}`;
