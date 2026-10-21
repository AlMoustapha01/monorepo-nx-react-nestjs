import { trace } from '@opentelemetry/api';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import type { ErrorEvent } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { reportError } from './report-error';

describe('reportError', () => {
  const sent: ErrorEvent[] = [];
  const sdk = new NodeSDK({
    spanProcessors: [new tracing.SimpleSpanProcessor(new tracing.InMemorySpanExporter())],
    instrumentations: [],
    autoDetectResources: false,
  });

  beforeAll(() => {
    sdk.start();
    // Le vrai client ; beforeSend garde l'événement au lieu de l'envoyer.
    Sentry.initWithoutDefaultIntegrations({
      dsn: 'https://public@sentry.example/1',
      beforeSend: (event) => {
        sent.push(event);
        return null;
      },
    });
  });
  afterAll(async () => {
    await Sentry.close(0);
    await sdk.shutdown();
  });

  it('envoie l’erreur avec ses tags et le trace_id de la requête', () => {
    const traceId = trace.getTracer('test').startActiveSpan('POST /api/auth/sign-in', (span) => {
      reportError(new Error('boom'), { operation: 'api', ignored: undefined });
      span.end();
      return span.spanContext().traceId;
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      exception: { values: [{ value: 'boom' }] },
      tags: { operation: 'api', trace_id: traceId },
    });
    expect(sent[0]?.tags).not.toHaveProperty('ignored');
  });
});
