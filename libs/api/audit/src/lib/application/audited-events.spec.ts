import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { type IntegrationEvent, RequestContext } from '@nx-react-nestjs/api-core';
import { defineIntegrationEvent } from '@nx-react-nestjs/contracts';
// example:start
import { OrderCancelled, OrderPlaced } from '@nx-react-nestjs/contracts';
// example:end
import { ClsService } from 'nestjs-cls';
import { z } from 'zod';
import { type AuditedEventHandler, auditEvent } from './audit-event';
import { AuditTrail } from './audit-trail';
import { AUDITED_EVENT_HANDLERS } from './audited-events';
import { InMemoryAuditLog } from './testing/in-memory-audit-log';

describe('audited integration events', () => {
  const context = new RequestContext(new ClsService(new AsyncLocalStorage()));
  const tenantId = randomUUID();
  const actorId = randomUUID();

  const handle = async <T>(
    event: IntegrationEvent,
    handlers: readonly AuditedEventHandler[] = AUDITED_EVENT_HANDLERS,
  ) => {
    const log = new InMemoryAuditLog(context);
    const trail = new AuditTrail(log, context);
    const Handler = handlers.find((candidate) => candidate.audits === event.type);
    if (!Handler) throw new Error(`No audit handler for ${event.type}`);
    // Le worker exécute le handler au nom du tenant et de l'auteur de l'événement.
    await context.runAs({ tenantId, userId: event.actorId }, () =>
      new Handler(trail).handle(event),
    );
    return log.all() as T;
  };

  const envelope = (type: string, payload: unknown): IntegrationEvent => ({
    id: 'EVT-01jb4x7k2m9qwfzp3hd8',
    type,
    tenantId,
    actorId,
    occurredAt: '2026-11-17T10:00:00.000Z',
    payload: payload as never,
  });

  it('records an event at its date, by its author, as described', async () => {
    const ThingShipped = defineIntegrationEvent(
      'test.thing-shipped.v1',
      z.object({ thingId: z.string(), parcels: z.number(), recipientEmail: z.email() }),
    );
    const Handler = auditEvent(ThingShipped, {
      name: 'audit.test.thing-shipped',
      describe: ({ thingId, parcels }) => ({
        action: 'test.thing-shipped',
        resource: { type: 'thing', id: thingId },
        details: { parcels },
      }),
    });

    expect(Handler.audits).toBe('test.thing-shipped.v1');
    expect(Handler.handlerName).toBe('audit.test.thing-shipped');
    const [entry] = await handle<
      { tenantId: string; actorId: string; action: string; details: unknown; occurredAt: Date }[]
    >(
      envelope('test.thing-shipped.v1', {
        thingId: 'T-1',
        parcels: 2,
        recipientEmail: 'jane@example.com',
      }),
      [Handler],
    );
    expect(entry).toMatchObject({
      tenantId,
      actorId,
      action: 'test.thing-shipped',
      resource: { type: 'thing', id: 'T-1' },
      details: { parcels: 2 },
      occurredAt: new Date('2026-11-17T10:00:00.000Z'),
    });
  });

  // example:start
  it('records a placed order, by its customer, at the time of the event', async () => {
    const [entry] = await handle<
      { actorId: string; action: string; resource: unknown; details: unknown; occurredAt: Date }[]
    >(
      envelope(OrderPlaced.type, {
        orderId: 'ORD-01jb4x7k2m9qwfzp3hd8',
        customerId: actorId,
        customerEmail: 'jane@example.com',
        currency: 'XOF',
        totalMinor: 15_000,
        lines: [
          {
            productId: 'PRD-01jb4x7k2m9qwfzp3hd8',
            sku: 'A',
            name: 'A',
            unitPriceMinor: 5_000,
            quantity: 3,
          },
        ],
        placedAt: '2026-11-17T10:00:00.000Z',
      }),
    );

    expect(entry).toMatchObject({
      actorId,
      action: 'orders.order-placed',
      resource: { type: 'order', id: 'ORD-01jb4x7k2m9qwfzp3hd8' },
      // Pas d'email : il survivrait à l'effacement de la personne.
      details: { totalMinor: 15_000, currency: 'XOF', lines: 1 },
      occurredAt: new Date('2026-11-17T10:00:00.000Z'),
    });
  });

  it('records a cancelled order', async () => {
    const [entry] = await handle<{ action: string; resource: unknown }[]>(
      envelope(OrderCancelled.type, {
        orderId: 'ORD-01jb4x7k2m9qwfzp3hd8',
        lines: [{ productId: 'PRD-01jb4x7k2m9qwfzp3hd8', quantity: 3 }],
        cancelledAt: '2026-11-17T10:00:00.000Z',
      }),
    );

    expect(entry).toMatchObject({
      action: 'orders.order-cancelled',
      resource: { type: 'order', id: 'ORD-01jb4x7k2m9qwfzp3hd8' },
    });
  });
  // example:end

  it('gives every handler a stable and unique name in the audit domain', () => {
    const names = AUDITED_EVENT_HANDLERS.map((Handler) => Handler.handlerName);
    expect(new Set(names).size).toBe(names.length);
    expect(names.every((name) => name.startsWith('audit.'))).toBe(true);
  });
});
