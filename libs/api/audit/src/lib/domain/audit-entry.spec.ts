import { AuditEntry } from './audit-entry';

const base = {
  id: 'AUD-01jb4x7k2m9qwfzp3hd8',
  tenantId: '2f1e4c4e-7d5b-4b5e-9f0a-1c2d3e4f5a6b',
  actorId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
  occurredAt: new Date('2026-11-17T10:00:00.000Z'),
  traceId: null,
};

describe('AuditEntry', () => {
  it('records an action with its resource and details', () => {
    const entry = AuditEntry.record({
      ...base,
      action: 'orders.order-cancelled',
      resource: { type: 'order', id: 'ORD-01jb4x7k2m9qwfzp3hd8' },
      details: { lines: 2 },
    });

    expect(entry.action).toBe('orders.order-cancelled');
    expect(entry.resource).toEqual({ type: 'order', id: 'ORD-01jb4x7k2m9qwfzp3hd8' });
    expect(entry.details).toEqual({ lines: 2 });
  });

  it('refuses an action that is not <domain>.<past-tense-fact>', () => {
    expect(() =>
      AuditEntry.record({ ...base, action: 'Cancel order', resource: null, details: {} }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_AUDIT_ENTRY' }));
  });

  it('refuses details that are not plain values', () => {
    expect(() =>
      AuditEntry.record({
        ...base,
        action: 'orders.order-placed',
        resource: null,
        details: { lines: [{ sku: 'A' }] } as never,
      }),
    ).toThrow(expect.objectContaining({ code: 'INVALID_AUDIT_ENTRY' }));
  });

  it('keeps its details out of reach of the caller', () => {
    const details = { lines: 2 };
    const entry = AuditEntry.record({
      ...base,
      action: 'orders.order-placed',
      resource: null,
      details,
    });
    details.lines = 3;

    expect(entry.details).toEqual({ lines: 2 });
  });
});
