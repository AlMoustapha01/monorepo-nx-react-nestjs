import { randomUUID } from 'node:crypto';
import { domainIdGenerator } from '@nx-react-nestjs/api-core';
import {
  createTestRequestContext,
  describeTenantIsolation,
  startTestDatabase,
  type TestDatabase,
} from '@nx-react-nestjs/api-core/testing';
import { AuditEntry } from '../domain/audit-entry';
import { DrizzleAuditLog } from './drizzle-audit-log';

const newEntryId = domainIdGenerator('AUD');

describe('DrizzleAuditLog (real Postgres)', () => {
  const context = createTestRequestContext();
  const tenant = { userId: randomUUID(), tenantId: randomUUID() };
  let database: TestDatabase;
  let log: DrizzleAuditLog;

  beforeAll(async () => {
    database = await startTestDatabase();
    log = new DrizzleAuditLog(database.session(context), context);
  });

  afterAll(() => database?.stop());

  const newEntry = (
    tenantId: string,
    overrides: Partial<Parameters<typeof AuditEntry.record>[0]> = {},
  ) =>
    AuditEntry.record({
      id: newEntryId(),
      tenantId,
      actorId: randomUUID(),
      action: 'orders.order-placed',
      resource: { type: 'order', id: `ORD-${randomUUID()}` },
      details: { lines: 2, currency: 'XOF', refunded: false, note: null },
      occurredAt: new Date(),
      traceId: '4bf92f3577b34da6a3ce929d0e0e4736',
      ...overrides,
    });

  it('reads back exactly what it wrote', () =>
    context.runAs(tenant, async () => {
      const entry = newEntry(tenant.tenantId);
      await log.append(entry);

      const { items } = await log.list({ limit: 1 });
      expect(items[0]).toEqual(entry);
    }));

  it('keeps an entry without actor nor resource (a system action)', () =>
    context.runAs(tenant, async () => {
      const entry = newEntry(tenant.tenantId, { actorId: null, resource: null, traceId: null });
      await log.append(entry);

      const { items } = await log.list({ limit: 1, action: 'orders.order-placed' });
      expect(items[0]).toEqual(entry);
    }));

  it('pages by (occurredAt, id) and filters by actor and action', () =>
    context.runAs({ userId: randomUUID(), tenantId: randomUUID() }, async () => {
      const actor = randomUUID();
      const at = (minute: number) => new Date(Date.UTC(2026, 10, 17, 10, minute));
      const tenantId = context.tenantId;
      const entries = [
        newEntry(tenantId, { actorId: actor, occurredAt: at(1) }),
        newEntry(tenantId, { actorId: actor, occurredAt: at(2), action: 'orders.order-cancelled' }),
        newEntry(tenantId, { occurredAt: at(3) }),
      ];
      for (const entry of entries) await log.append(entry);

      const first = await log.list({ limit: 2 });
      expect(first.items.map((entry) => entry.id)).toEqual([entries[2]?.id, entries[1]?.id]);
      expect(first.hasMore).toBe(true);
      const last = first.items.at(-1);
      const second = await log.list({
        limit: 2,
        after: last && { createdAt: last.occurredAt, id: last.id },
      });
      expect(second.items.map((entry) => entry.id)).toEqual([entries[0]?.id]);
      expect(second.hasMore).toBe(false);

      expect((await log.list({ limit: 10, actorId: actor })).items).toHaveLength(2);
      expect(
        (await log.list({ limit: 10, actorId: actor, action: 'orders.order-cancelled' })).items,
      ).toHaveLength(1);
    }));

  describeTenantIsolation('DrizzleAuditLog', {
    database: () => database,
    repository: (session, context) => new DrizzleAuditLog(session, context),
    entity: (tenantId) => newEntry(tenantId),
    insert: (repository, entry) => repository.append(entry),
    find: async (repository, entry) =>
      (await repository.list({ limit: 100 })).items.find((item) => item.id === entry.id) ?? null,
    reads: {
      list: (repository) => repository.list({ limit: 100 }),
      'list by actor': (repository, entry) =>
        repository.list({ limit: 100, actorId: entry.actorId ?? undefined }),
    },
    writes: {},
  });
});
