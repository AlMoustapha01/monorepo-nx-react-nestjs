import { trace } from '@opentelemetry/api';
import { captureException, withScope } from '@sentry/core';

export interface ErrorReport {
  /** Recherchables dans Sentry : `request_id`, `handler`, `tenant_id`… */
  tags?: Record<string, string | undefined>;
  userId?: string;
}

/**
 * Envoie une erreur inattendue à Sentry, avec le `trace_id` OpenTelemetry pour retrouver la trace
 * et les logs. Sans SENTRY_DSN, Sentry n'est pas initialisé : l'appel ne fait rien.
 */
export function reportError(error: unknown, { tags = {}, userId }: ErrorReport = {}): void {
  withScope((scope) => {
    const traceId = trace.getActiveSpan()?.spanContext().traceId;
    for (const [key, value] of Object.entries({ ...tags, trace_id: traceId })) {
      if (value) {
        scope.setTag(key, value);
      }
    }
    if (userId) {
      // L'ID seulement : pas d'email ni d'autre donnée personnelle chez un tiers.
      scope.setUser({ id: userId });
    }
    captureException(error);
  });
}
