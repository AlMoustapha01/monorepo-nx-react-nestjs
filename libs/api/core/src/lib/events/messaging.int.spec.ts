import { randomUUID } from 'node:crypto';
import { Injectable, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { defineIntegrationEvent } from '@nx-react-nestjs/contracts';
import { trace } from '@opentelemetry/api';
import { z } from 'zod';
import {
  eventually,
  startTestDatabase,
  startTestRedis,
  startTestTelemetry,
  type TestDatabase,
  testEnv,
  type TestRedis,
} from '../../testing';
import { RequestContext } from '../context/request-context';
import { CoreModule } from '../core.module';
import { DatabaseSession, TransactionManager } from '../database/database-session';
import {
  type IntegrationEvent,
  type IntegrationEventHandler,
  OnIntegrationEvent,
} from './integration-event';
import { INTEGRATION_EVENTS_QUEUE, type IntegrationEventJob } from './integration-event.queue';
import { IntegrationEventWorker } from './integration-event.worker';
import type { Queue } from 'bullmq';
import { Outbox } from './outbox';

const Pinged = defineIntegrationEvent('test.pinged.v1', z.object({ n: z.number().int() }));

@Injectable()
@OnIntegrationEvent(Pinged, { name: 'test.record-ping' })
class RecordPing implements IntegrationEventHandler<typeof Pinged> {
  readonly received: {
    event: IntegrationEvent<typeof Pinged>;
    tenantInContext: string;
    traceId?: string;
  }[] = [];
  failuresBeforeSuccess = 0;

  constructor(private readonly context: RequestContext) {}

  async handle(event: IntegrationEvent<typeof Pinged>): Promise<void> {
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess--;
      throw new Error('transient failure');
    }
    this.received.push({
      event,
      tenantInContext: this.context.tenantId,
      traceId: trace.getActiveSpan()?.spanContext().traceId,
    });
  }

  numbers(): number[] {
    return this.received.map(({ event }) => event.payload.n);
  }
}

@Injectable()
@OnIntegrationEvent(Pinged, { name: 'test.count-ping' })
class CountPing implements IntegrationEventHandler<typeof Pinged> {
  readonly numbers: number[] = [];

  async handle(event: IntegrationEvent<typeof Pinged>): Promise<void> {
    this.numbers.push(event.payload.n);
  }
}

/** Simule un appel externe : doit s'exécuter hors transaction. */
@Injectable()
@OnIntegrationEvent(Pinged, { name: 'test.notify-ping', transactional: false })
class NotifyPing implements IntegrationEventHandler<typeof Pinged> {
  readonly calls: { n: number; inTransaction: boolean }[] = [];
  failuresBeforeSuccess = 0;

  constructor(private readonly session: DatabaseSession) {}

  async handle(event: IntegrationEvent<typeof Pinged>): Promise<void> {
    this.calls.push({ n: event.payload.n, inTransaction: this.session.inTransaction });
    if (this.failuresBeforeSuccess > 0) {
      this.failuresBeforeSuccess--;
      throw new Error('external service unavailable');
    }
  }

  succeeded(n: number): number {
    return this.calls.filter((call) => call.n === n).length;
  }
}

@Module({ providers: [RecordPing, CountPing, NotifyPing] })
class TestHandlersModule {}

describe('messagerie : outbox → BullMQ → handlers (Postgres et Redis réels)', () => {
  const principal = { userId: randomUUID(), tenantId: randomUUID() };
  let database: TestDatabase;
  let redis: TestRedis;
  let app: TestingModule;
  let context: RequestContext;
  let transactions: TransactionManager;
  let outbox: Outbox;
  let recorder: RecordPing;
  const telemetry = startTestTelemetry();

  beforeAll(async () => {
    [database, redis] = await Promise.all([startTestDatabase(), startTestRedis()]);
    Object.assign(process.env, testEnv({ databaseUrl: database.url, redisUrl: redis.url }));
    app = await Test.createTestingModule({ imports: [CoreModule, TestHandlersModule] }).compile();
    await app.init();
    context = app.get(RequestContext);
    transactions = app.get(TransactionManager);
    outbox = app.get(Outbox);
    recorder = app.get(RecordPing);
  });

  afterAll(async () => {
    await app?.close();
    await Promise.all([database?.stop(), redis?.stop(), telemetry.stop()]);
  });

  const publish = (n: number) =>
    context.runAs(principal, () => transactions.transaction(() => outbox.publish(Pinged, { n })));

  it('livre l’événement au handler, dans le contexte du tenant et de l’auteur', async () => {
    await publish(1);

    await eventually(() => expect(recorder.numbers()).toContain(1));
    const { event, tenantInContext } = recorder.received.find((r) => r.event.payload.n === 1)!;
    expect(event).toMatchObject({
      type: 'test.pinged.v1',
      tenantId: principal.tenantId,
      actorId: principal.userId,
      id: expect.stringMatching(/^EVT-/),
    });
    expect(tenantInContext).toBe(principal.tenantId);
  });

  it('exécute le handler dans la trace de la requête qui a publié l’événement', async () => {
    const traceId = await trace.getTracer('test').startActiveSpan('POST /pings', async (span) => {
      await publish(20);
      span.end();
      return span.spanContext().traceId;
    });

    await eventually(() => expect(recorder.numbers()).toContain(20));
    expect(recorder.received.find((r) => r.event.payload.n === 20)?.traceId).toBe(traceId);
  });

  it('livre chaque événement à chacun de ses handlers', async () => {
    await publish(2);
    await eventually(() => {
      expect(recorder.numbers()).toContain(2);
      expect(app.get(CountPing).numbers).toContain(2);
    });
  });

  it('n’émet rien si la transaction métier est annulée', async () => {
    await expect(
      context.runAs(principal, () =>
        transactions.transaction(async () => {
          await outbox.publish(Pinged, { n: 3 });
          throw new Error('business write failed');
        }),
      ),
    ).rejects.toThrow('business write failed');

    await publish(4);
    await eventually(() => expect(recorder.numbers()).toContain(4));
    expect(recorder.numbers()).not.toContain(3);
  });

  it('refuse de publier hors transaction', async () => {
    await expect(
      context.runAs(principal, () => outbox.publish(Pinged, { n: 5 })),
    ).rejects.toMatchObject({ code: 'OUTBOX_REQUIRES_TRANSACTION' });
  });

  it('refuse un payload qui ne respecte pas le contrat', async () => {
    await expect(
      context.runAs(principal, () =>
        transactions.transaction(() => outbox.publish(Pinged, { n: 1.5 })),
      ),
    ).rejects.toThrow(z.ZodError);
  });

  it('réessaie un handler en échec', async () => {
    recorder.failuresBeforeSuccess = 1;
    await publish(6);
    await eventually(() => expect(recorder.numbers()).toContain(6));
    expect(recorder.failuresBeforeSuccess).toBe(0);
  });

  it('ignore un événement déjà traité par le même handler', async () => {
    const worker = app.get(IntegrationEventWorker);
    const job = {
      name: 'test.record-ping',
      data: {
        handler: 'test.record-ping',
        event: {
          id: 'EVT-01jb4x7k2m9qwfzp3hd8',
          type: 'test.pinged.v1',
          tenantId: principal.tenantId,
          actorId: principal.userId,
          occurredAt: new Date().toISOString(),
          payload: { n: 7 },
        },
      },
    };

    await worker.process(job);
    await worker.process(job);

    expect(recorder.numbers().filter((n) => n === 7)).toHaveLength(1);
  });

  describe('métriques', () => {
    const pointsOf = async (name: string) => (await telemetry.collectMetrics())[name] ?? [];

    it('mesure la durée des handlers, l’outbox et la file', async () => {
      await publish(30);
      await eventually(() => expect(recorder.numbers()).toContain(30));

      expect(await pointsOf('integration_events.handler.duration')).toContainEqual(
        expect.objectContaining({
          attributes: { 'app.event.handler': 'test.record-ping', outcome: 'success' },
        }),
      );
      await eventually(async () =>
        expect(await pointsOf('outbox.pending_events')).toEqual([
          expect.objectContaining({ value: 0 }),
        ]),
      );
      expect((await pointsOf('integration_events.queue.jobs')).map((p) => p.attributes)).toEqual(
        expect.arrayContaining([{ state: 'waiting' }, { state: 'failed' }]),
      );
    });

    it('compte un job abandonné, sans retry pour un payload invalide', async () => {
      const queue = app.get<Queue<IntegrationEventJob>>(INTEGRATION_EVENTS_QUEUE);
      await queue.add('test.record-ping', {
        handler: 'test.record-ping',
        event: {
          id: 'EVT-01jb4x7k2m9qwfzp3hdb',
          type: 'test.pinged.v1',
          tenantId: principal.tenantId,
          actorId: principal.userId,
          occurredAt: new Date().toISOString(),
          payload: { n: 'pas un nombre' },
        },
      });

      await eventually(async () =>
        expect(await pointsOf('integration_events.jobs.exhausted')).toContainEqual(
          expect.objectContaining({
            attributes: { 'app.event.handler': 'test.record-ping' },
            value: 1,
          }),
        ),
      );
    });
  });

  describe('handler non transactionnel', () => {
    const jobFor = (n: number, eventId: string) => ({
      name: 'test.notify-ping',
      data: {
        handler: 'test.notify-ping',
        event: {
          id: eventId,
          type: 'test.pinged.v1',
          tenantId: principal.tenantId,
          actorId: principal.userId,
          occurredAt: new Date().toISOString(),
          payload: { n },
        },
      },
    });

    it('s’exécute hors transaction, au nom du tenant', async () => {
      await publish(8);
      const notifier = app.get(NotifyPing);
      await eventually(() => expect(notifier.succeeded(8)).toBe(1));
      expect(notifier.calls.find((call) => call.n === 8)?.inTransaction).toBe(false);
    });

    it('ignore un événement déjà traité', async () => {
      const worker = app.get(IntegrationEventWorker);
      const job = jobFor(9, 'EVT-01jb4x7k2m9qwfzp3hd9');
      await worker.process(job);
      await worker.process(job);
      expect(app.get(NotifyPing).succeeded(9)).toBe(1);
    });

    it('ne marque pas l’événement en cas d’échec : le retry le retraite', async () => {
      const worker = app.get(IntegrationEventWorker);
      const notifier = app.get(NotifyPing);
      const job = jobFor(10, 'EVT-01jb4x7k2m9qwfzp3hda');
      notifier.failuresBeforeSuccess = 1;

      await expect(worker.process(job)).rejects.toThrow('external service unavailable');
      await worker.process(job);
      await worker.process(job);

      // Deux appels (l'échec puis le succès), et plus rien une fois marqué.
      expect(notifier.succeeded(10)).toBe(2);
    });
  });
});
