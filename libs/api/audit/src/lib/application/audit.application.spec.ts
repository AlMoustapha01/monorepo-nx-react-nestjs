import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { RequestContext } from '@nx-react-nestjs/api-core';
import { ClsService } from 'nestjs-cls';
import { AuditTrail } from './audit-trail';
import { InMemoryAuditLog } from './testing/in-memory-audit-log';
import { ListAuditEntries } from './use-cases/list-audit-entries';

describe('audit application', () => {
  const context = new RequestContext(new ClsService(new AsyncLocalStorage()));
  const tenantId = randomUUID();
  const alice = randomUUID();
  const bob = randomUUID();
  let log: InMemoryAuditLog;
  let trail: AuditTrail;
  let list: ListAuditEntries;

  beforeEach(() => {
    log = new InMemoryAuditLog(context);
    trail = new AuditTrail(log, context);
    list = new ListAuditEntries(log);
  });

  const asStaff = <T>(fn: () => Promise<T>) =>
    context.runAs({ tenantId, userId: alice, roles: ['staff'] }, fn);

  const recordAt = (minute: number, actorId: string, action: string) =>
    context.runAs({ tenantId, userId: actorId }, () =>
      trail.record({
        actorId,
        action,
        resource: { type: 'order', id: `ORD-${minute}` },
        details: {},
        occurredAt: new Date(Date.UTC(2026, 10, 17, 10, minute)),
      }),
    );

  it('records an entry in the tenant of the context, with its actor and date', async () => {
    await recordAt(1, bob, 'orders.order-placed');

    const [entry] = log.all();
    expect(entry).toMatchObject({ tenantId, actorId: bob, action: 'orders.order-placed' });
    expect(entry?.id).toMatch(/^AUD-/);
  });

  it('lists the newest entries first, page by page', async () => {
    for (const minute of [1, 2, 3]) {
      await recordAt(minute, bob, 'orders.order-placed');
    }

    const first = await asStaff(() => list.execute({ limit: 2 }));
    expect(first.items.map((entry) => entry.resource?.id)).toEqual(['ORD-3', 'ORD-2']);
    expect(first.nextCursor).not.toBeNull();

    const second = await asStaff(() =>
      list.execute({ limit: 2, cursor: first.nextCursor ?? undefined }),
    );
    expect(second.items.map((entry) => entry.resource?.id)).toEqual(['ORD-1']);
    expect(second.nextCursor).toBeNull();
  });

  it('filters by actor and by action', async () => {
    await recordAt(1, bob, 'orders.order-placed');
    await recordAt(2, alice, 'orders.order-placed');
    await recordAt(3, bob, 'orders.order-cancelled');

    const byBob = await asStaff(() => list.execute({ limit: 20, actorId: bob }));
    expect(byBob.items.map((entry) => entry.resource?.id)).toEqual(['ORD-3', 'ORD-1']);
    const cancelled = await asStaff(() =>
      list.execute({ limit: 20, action: 'orders.order-cancelled' }),
    );
    expect(cancelled.items.map((entry) => entry.resource?.id)).toEqual(['ORD-3']);
  });

  it("does not list another tenant's entries", async () => {
    await recordAt(1, bob, 'orders.order-placed');

    const other = await context.runAs(
      { tenantId: randomUUID(), userId: alice, roles: ['staff'] },
      () => list.execute({ limit: 20 }),
    );
    expect(other.items).toEqual([]);
  });
});
