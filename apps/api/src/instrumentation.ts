/**
 * Premier import de main.ts et worker.ts : les instrumentations doivent être enregistrées avant
 * le premier require de http, express, pg et @nestjs/core.
 * Inactif sans OTEL_EXPORTER_OTLP_ENDPOINT (aucun coût en test ni en dev par défaut). Le reste se
 * configure par les variables standard : OTEL_SERVICE_NAME, OTEL_TRACES_SAMPLER, etc.
 */
import { existsSync } from 'node:fs';
import { ExpressInstrumentation } from '@opentelemetry/instrumentation-express';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { NestInstrumentation } from '@opentelemetry/instrumentation-nestjs-core';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { PinoInstrumentation } from '@opentelemetry/instrumentation-pino';
import { NodeSDK } from '@opentelemetry/sdk-node';

if (existsSync('.env')) {
  process.loadEnvFile('.env');
}

const UNTRACED_PATHS = new Set(['/health', '/ready']);

const enabled =
  Boolean(process.env['OTEL_EXPORTER_OTLP_ENDPOINT']) &&
  process.env['OTEL_SDK_DISABLED'] !== 'true';

const sdk = enabled
  ? new NodeSDK({
      instrumentations: [
        new HttpInstrumentation({
          ignoreIncomingRequestHook: (request) => UNTRACED_PATHS.has(request.url ?? ''),
        }),
        new ExpressInstrumentation(),
        new NestInstrumentation(),
        // Sans span parent, pas de span : le relais qui interroge l'outbox chaque seconde ne crée
        // pas une trace par requête.
        new PgInstrumentation({ requireParentSpan: true }),
        // trace_id et span_id dans chaque ligne de log émise pendant un span.
        new PinoInstrumentation(),
      ],
    })
  : undefined;
sdk?.start();

/** Envoie les spans encore en mémoire ; appelé après la fermeture de l'application. */
export async function shutdownTelemetry(): Promise<void> {
  await sdk?.shutdown();
}
