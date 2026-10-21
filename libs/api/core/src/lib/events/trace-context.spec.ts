import { SpanStatusCode, trace } from '@opentelemetry/api';
import { startTestTelemetry } from '../../testing';
import type { IntegrationEventJob } from './integration-event.queue';
import { captureTraceContext, inHandlerSpan } from './trace-context';

const job = (traceContext?: Record<string, string>): IntegrationEventJob => ({
  handler: 'test.handler',
  event: {
    id: 'EVT-01jb4x7k2m9qwfzp3hd8',
    type: 'test.pinged.v1',
    tenantId: 'tenant',
    actorId: 'actor',
    occurredAt: new Date().toISOString(),
    payload: {},
  },
  traceContext,
});

describe('contexte de trace des événements', () => {
  const tracing = startTestTelemetry();
  const tracer = trace.getTracer('test');
  afterEach(() => tracing.spans.reset());
  afterAll(() => tracing.stop());

  it('ne capture rien hors d’un span', () => {
    expect(captureTraceContext()).toBeNull();
  });

  it('exécute le handler dans un span enfant de la requête qui a publié l’événement', async () => {
    const { carrier, requestSpanId, traceId } = tracer.startActiveSpan('request', (span) => {
      span.end();
      const { spanId, traceId } = span.spanContext();
      return { carrier: captureTraceContext(), requestSpanId: spanId, traceId };
    });
    expect(carrier).toEqual({ traceparent: expect.stringContaining(traceId) });

    const seen = await inHandlerSpan(
      job(carrier ?? undefined),
      async () => trace.getActiveSpan()?.spanContext().traceId,
    );

    expect(seen).toBe(traceId);
    const handlerSpan = tracing.spans
      .getFinishedSpans()
      .find((s) => s.name === 'process test.handler');
    expect(handlerSpan?.parentSpanContext?.spanId).toBe(requestSpanId);
    expect(handlerSpan?.attributes).toMatchObject({
      'messaging.message.id': 'EVT-01jb4x7k2m9qwfzp3hd8',
    });
  });

  it('marque le span en erreur et laisse remonter l’exception', async () => {
    await expect(
      inHandlerSpan(job(), async () => {
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    const [span] = tracing.spans.getFinishedSpans();
    expect(span.status.code).toBe(SpanStatusCode.ERROR);
    expect(span.events.map((e) => e.name)).toContain('exception');
  });
});
