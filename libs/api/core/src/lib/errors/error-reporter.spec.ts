import { type ArgumentsHost, ServiceUnavailableException } from '@nestjs/common';
import { trace } from '@opentelemetry/api';
import type { ErrorEvent } from '@sentry/core';
import * as Sentry from '@sentry/node';
import { createTestRequestContext, startTestTelemetry } from '../../testing';
import { CoreError } from './app-error';
import { reportError } from './error-reporter';
import { ProblemDetailsFilter } from './problem-details.filter';

describe('signalement des erreurs à Sentry', () => {
  const telemetry = startTestTelemetry();
  const sent: ErrorEvent[] = [];
  afterEach(() => {
    sent.length = 0;
  });

  beforeAll(() => {
    // Le vrai client, initialisé comme dans instrumentation.ts ; beforeSend garde l'événement.
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
    await telemetry.stop();
  });

  it('envoie l’erreur avec ses tags, l’ID utilisateur et le trace_id de la requête', () => {
    const traceId = trace.getTracer('test').startActiveSpan('POST /api/v1/orders', (span) => {
      reportError(new Error('boom'), {
        tags: { request_id: 'req-1', tenant_id: undefined },
        userId: 'user-1',
      });
      span.end();
      return span.spanContext().traceId;
    });

    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      exception: { values: [{ value: 'boom' }] },
      tags: { request_id: 'req-1', trace_id: traceId },
      user: { id: 'user-1' },
    });
    expect(sent[0].tags).not.toHaveProperty('tenant_id');
  });

  describe('ProblemDetailsFilter', () => {
    const context = createTestRequestContext();
    const filter = new ProblemDetailsFilter(context);
    const principal = { userId: 'user-2', tenantId: 'tenant-2' };
    const hostFor = (): ArgumentsHost => {
      const response = { status: () => response, type: () => response, json: () => response };
      const request = {
        method: 'POST',
        path: '/api/v1/orders/ORD-1/cancel',
        originalUrl: '/api/v1/orders/ORD-1/cancel',
        route: { path: '/api/v1/orders/:id/cancel' },
      };
      return {
        switchToHttp: () => ({ getRequest: () => request, getResponse: () => response }),
      } as unknown as ArgumentsHost;
    };

    it('envoie une erreur inattendue avec la route et l’utilisateur', () => {
      context.runAs(principal, () => filter.catch(new Error('bug'), hostFor()));
      expect(sent).toEqual([
        expect.objectContaining({
          tags: expect.objectContaining({
            route: 'POST /api/v1/orders/:id/cancel',
            tenant_id: 'tenant-2',
          }),
          user: { id: 'user-2' },
        }),
      ]);
    });

    it('n’envoie ni une erreur métier ni un 5xx levé exprès', () => {
      context.runAs(principal, () => {
        filter.catch(new CoreError('FORBIDDEN', 'nope'), hostFor());
        filter.catch(new ServiceUnavailableException('Shutting down'), hostFor());
      });
      expect(sent).toEqual([]);
    });
  });
});
