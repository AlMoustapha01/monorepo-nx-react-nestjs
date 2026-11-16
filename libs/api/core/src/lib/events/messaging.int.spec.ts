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
import { sql } from 'drizzle-orm';
import { enqueueIntegrationEvent, type IntegrationEventJob } from './job-queue';
import { IntegrationEventWorker } from './integration-event.worker';
import { outbox as outboxTable } from './messaging.schema';
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

describe('messaging: outbox → Graphile Worker → handlers (real Postgres)', () => {
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

  const jobsWithKey = async (key: string) => {
    const { rows } = await database.db.execute<{ attempts: number; last_error: string | null }>(
      sql`select attempts, last_error from graphile_worker.jobs where key = ${key}`,
    );
    return rows;
  };

  const event = (id: string, payload: unknown) => ({
    id,
    type: 'test.pinged.v1',
    tenantId: principal.tenantId,
    actorId: principal.userId,
    occurredAt: new Date().toISOString(),
    payload,
  });

  const publish = (n: number) =>
    context.runAs(principal, () => transactions.transaction(() => outbox.publish(Pinged, { n })));

  it('delivers the event to the handler, in the context of the tenant and the author', async () => {
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

  it('runs the handler in the trace of the request that published the event', async () => {
    const traceId = await trace.getTracer('test').startActiveSpan('POST /pings', async (span) => {
      await publish(20);
      span.end();
      return span.spanContext().traceId;
    });

    await eventually(() => expect(recorder.numbers()).toContain(20));
    expect(recorder.received.find((r) => r.event.payload.n === 20)?.traceId).toBe(traceId);
  });

  it('delivers each event to each of its handlers', async () => {
    await publish(2);
    await eventually(() => {
      expect(recorder.numbers()).toContain(2);
      expect(app.get(CountPing).numbers).toContain(2);
    });
  });

  it('emits nothing if the business transaction is rolled back', async () => {
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

  it('enqueues one job per handler in the business transaction, under a stable key', async () => {
    const { rows } = await context.runAs(principal, () =>
      transactions.transaction(async () => {
        await outbox.publish(Pinged, { n: 40 });
        // Lu dans la même transaction : les jobs existent avant même la validation. La vue
        // publique n'expose pas le payload, d'où la table interne de Graphile.
        return app.get(DatabaseSession).db.execute<{ key: string }>(
          sql`select key from graphile_worker._private_jobs
              where payload->'event'->'payload'->>'n' = '40'`,
        );
      }),
    );
    expect(rows.map((row) => row.key).sort()).toEqual([
      expect.stringMatching(/^EVT-.+:test\.count-ping$/),
      expect.stringMatching(/^EVT-.+:test\.notify-ping$/),
      expect.stringMatching(/^EVT-.+:test\.record-ping$/),
    ]);
    await eventually(() => expect(recorder.numbers()).toContain(40));
  });

  it('relays the events left unpublished by a previous version', async () => {
    // Écrit comme le faisait l'ancienne version, avant son relais.
    await database.db.insert(outboxTable).values({
      id: 'EVT-01jb4x7k2m9qwfzp3hdc',
      tenantId: principal.tenantId,
      actorId: principal.userId,
      type: 'test.pinged.v1',
      payload: { n: 41 },
      occurredAt: new Date(),
    });

    await app.get(IntegrationEventWorker).relayPending();

    await eventually(() => expect(recorder.numbers()).toContain(41));
    const [row] = await database.db
      .select({ publishedAt: outboxTable.publishedAt })
      .from(outboxTable)
      .where(sql`${outboxTable.id} = 'EVT-01jb4x7k2m9qwfzp3hdc'`);
    expect(row?.publishedAt).toBeInstanceOf(Date);
  });

  it('refuses to publish outside a transaction', async () => {
    await expect(
      context.runAs(principal, () => outbox.publish(Pinged, { n: 5 })),
    ).rejects.toMatchObject({ code: 'OUTBOX_REQUIRES_TRANSACTION' });
  });

  it('rejects a payload that does not match the contract', async () => {
    await expect(
      context.runAs(principal, () =>
        transactions.transaction(() => outbox.publish(Pinged, { n: 1.5 })),
      ),
    ).rejects.toThrow(z.ZodError);
  });

  it('retries a failing handler', async () => {
    recorder.failuresBeforeSuccess = 1;
    await publish(6);
    await eventually(() => expect(recorder.numbers()).toContain(6));
    expect(recorder.failuresBeforeSuccess).toBe(0);
  });

  it('retries a job whose handler is not deployed yet on this worker', async () => {
    // Pendant un déploiement, une API à jour met en file un job qu'un ancien worker ne connaît pas.
    await enqueueIntegrationEvent(database.db, {
      handler: 'test.not-deployed-yet',
      event: event('EVT-01jb4x7k2m9qwfzp3hdd', { n: 42 }),
    });

    await eventually(async () =>
      expect(await jobsWithKey('EVT-01jb4x7k2m9qwfzp3hdd:test.not-deployed-yet')).toEqual([
        expect.objectContaining({
          attempts: 1,
          last_error: expect.stringContaining('test.not-deployed-yet'),
        }),
      ]),
    );
  });

  it('ignores an event already processed by the same handler', async () => {
    const worker = app.get(IntegrationEventWorker);
    const job: IntegrationEventJob = {
      handler: 'test.record-ping',
      event: event('EVT-01jb4x7k2m9qwfzp3hd8', { n: 7 }),
    };

    await worker.process(job);
    await worker.process(job);

    expect(recorder.numbers().filter((n) => n === 7)).toHaveLength(1);
  });

  describe('metrics', () => {
    const pointsOf = async (name: string) => (await telemetry.collectMetrics())[name] ?? [];

    it('measures handler duration and the queue', async () => {
      await publish(30);
      await eventually(() => expect(recorder.numbers()).toContain(30));

      expect(await pointsOf('integration_events.handler.duration')).toContainEqual(
        expect.objectContaining({
          attributes: { 'app.event.handler': 'test.record-ping', outcome: 'success' },
        }),
      );
      await eventually(async () =>
        expect(await pointsOf('integration_events.queue.oldest_waiting_age')).toEqual([
          expect.objectContaining({ value: 0 }),
        ]),
      );
      expect((await pointsOf('integration_events.queue.jobs')).map((p) => p.attributes)).toEqual(
        expect.arrayContaining([
          { state: 'waiting' },
          { state: 'active' },
          { state: 'delayed' },
          { state: 'failed' },
        ]),
      );
    });

    it('counts an exhausted job, with no retry for an invalid payload', async () => {
      await enqueueIntegrationEvent(database.db, {
        handler: 'test.count-ping',
        event: event('EVT-01jb4x7k2m9qwfzp3hdb', { n: 'not a number' }),
      });

      await eventually(async () =>
        expect(await pointsOf('integration_events.jobs.exhausted')).toContainEqual(
          expect.objectContaining({
            attributes: { 'app.event.handler': 'test.count-ping' },
            value: 1,
          }),
        ),
      );
      // Terminé sans retry : rejouer ne corrigera pas le payload.
      await eventually(async () =>
        expect(await jobsWithKey('EVT-01jb4x7k2m9qwfzp3hdb:test.count-ping')).toEqual([]),
      );
    });
  });

  describe('non-transactional handler', () => {
    const jobFor = (n: number, eventId: string): IntegrationEventJob => ({
      handler: 'test.notify-ping',
      event: event(eventId, { n }),
    });

    it('runs outside a transaction, on behalf of the tenant', async () => {
      await publish(8);
      const notifier = app.get(NotifyPing);
      await eventually(() => expect(notifier.succeeded(8)).toBe(1));
      expect(notifier.calls.find((call) => call.n === 8)?.inTransaction).toBe(false);
    });

    it('ignores an already processed event', async () => {
      const worker = app.get(IntegrationEventWorker);
      const job = jobFor(9, 'EVT-01jb4x7k2m9qwfzp3hd9');
      await worker.process(job);
      await worker.process(job);
      expect(app.get(NotifyPing).succeeded(9)).toBe(1);
    });

    it('does not mark the event on failure: the retry processes it again', async () => {
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
