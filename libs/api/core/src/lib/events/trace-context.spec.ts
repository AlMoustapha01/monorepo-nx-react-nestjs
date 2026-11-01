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

describe('event trace context', () => {
  const tracing = startTestTelemetry();
  const tracer = trace.getTracer('test');
  afterEach(() => tracing.spans.reset());
  afterAll(() => tracing.stop());

  it('captures nothing outside a span', () => {
    expect(captureTraceContext()).toBeNull();
  });

  it('runs the handler in a child span of the request that published the event', async () => {
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

  it('marks the span as errored and lets the exception propagate', async () => {
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
