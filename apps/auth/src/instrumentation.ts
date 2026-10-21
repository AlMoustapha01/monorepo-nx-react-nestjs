/**
 * Premier import de main.ts : les instrumentations doivent être enregistrées avant le premier
 * require de http et pg. Même principe que l'API (apps/api/src/instrumentation.ts) :
 * - traces OpenTelemetry si OTEL_EXPORTER_OTLP_ENDPOINT est défini. Better Auth émet aussi ses
 *   propres spans (endpoints, hooks) dès qu'un SDK est actif ;
 * - Sentry, pour les erreurs seulement, si SENTRY_DSN est défini.
 */
import { existsSync } from 'node:fs';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { NodeSDK } from '@opentelemetry/sdk-node';
import * as Sentry from '@sentry/node';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

/** Le .env de dev est partagé avec l'API (OTEL_SERVICE_NAME=api) : le service a son propre nom. */
const SERVICE_NAME = process.env['AUTH_OTEL_SERVICE_NAME'] ?? 'auth';
const UNTRACED_PATHS = new Set(['/health', '/ready']);

const enabled =
  Boolean(process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) &&
  process.env['OTEL_SDK_DISABLED'] !== 'true';

const sdk = enabled
  ? new NodeSDK({
      serviceName: SERVICE_NAME,
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (request) => UNTRACED_PATHS.has(request.url ?? ''),
        }),
        // Sans span parent, pas de span : la sonde /ready ne crée pas une trace par appel.
        new PgInstrumentation({ requireParentSpan: true }),
        // trace_id et span_id dans chaque ligne de log émise pendant un span.
        new PinoInstrumentation(),
      ],
    })
  : undefined;
sdk?.start();

// Sans les intégrations par défaut : ni HTTP ni console, pour ne pas doubler OpenTelemetry et pino.
if (process.env['SENTRY_DSN']) {
  Sentry.initWithoutDefaultIntegrations({
    initialScope: { tags: { service: SERVICE_NAME } },
    integrations: [
      Sentry.eventFiltersIntegration(),
      Sentry.functionToStringIntegration(),
      Sentry.linkedErrorsIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.nodeContextIntegration(),
      Sentry.contextLinesIntegration(),
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
    ],
  });
}

/** Envoie spans et erreurs encore en mémoire ; appelé à l'arrêt, après la fermeture du serveur. */
export async function shutdownTelemetry(): Promise<void> {
  await Promise.all([sdk?.shutdown(), Sentry.close(2000)]);
}
