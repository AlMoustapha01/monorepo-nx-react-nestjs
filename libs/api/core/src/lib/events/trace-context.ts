import {
  context,
  propagation,
  ROOT_CONTEXT,
  SpanKind,
  SpanStatusCode,
  trace,
} from '@opentelemetry/api';
import { INTEGRATION_EVENTS_QUEUE_NAME, type IntegrationEventJob } from './integration-event.queue';

/** Contexte W3C (`traceparent`, `tracestate`) stocké avec l'événement. */
export type TraceCarrier = Record<string, string>;

/** Sans SDK OpenTelemetry actif, rien à propager : `null`. */
export function captureTraceContext(): TraceCarrier | null {
  const carrier: TraceCarrier = {};
  propagation.inject(context.active(), carrier);
  return Object.keys(carrier).length > 0 ? carrier : null;
}

const tracer = trace.getTracer('api-core.messaging');

/**
 * Exécute un handler dans un span enfant de la requête qui a publié l'événement : une seule trace
 * relie la requête HTTP, la transaction, le job et ses requêtes SQL.
 */
export function inHandlerSpan<T>(
  { handler, event, traceContext }: IntegrationEventJob,
  fn: () => Promise<T>,
): Promise<T> {
  const parent = propagation.extract(ROOT_CONTEXT, traceContext ?? {});
  return tracer.startActiveSpan(
    `process ${handler}`,
    {
      kind: SpanKind.CONSUMER,
      attributes: {
        'messaging.system': 'bullmq',
        'messaging.operation.type': 'process',
        'messaging.destination.name': INTEGRATION_EVENTS_QUEUE_NAME,
        'messaging.message.id': event.id,
        'app.event.type': event.type,
        'app.event.handler': handler,
        'app.tenant.id': event.tenantId,
      },
    },
    parent,
    async (span) => {
      try {
        return await fn();
      } catch (error) {
        span.recordException(error as Error);
        span.setStatus({ code: SpanStatusCode.ERROR });
        throw error;
      } finally {
        span.end();
      }
    },
  );
}
