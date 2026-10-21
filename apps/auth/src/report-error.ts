import { trace } from '@opentelemetry/api';
import * as Sentry from '@sentry/node';

/**
 * Envoie une erreur inattendue à Sentry, avec le `trace_id` de la requête pour retrouver la trace
 * et les logs. Sans SENTRY_DSN, Sentry n'est pas initialisé : l'appel ne fait rien.
 */
export function reportError(error: unknown, tags: Record<string, string | undefined> = {}): void {
  Sentry.withScope((scope) => {
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    for (const [key, value] of Object.entries({ ...tags, trace_id: traceId })) {
      if (value) {
        scope.setTag(key, value);
      }
    }
    Sentry.captureException(error);
  });
}
