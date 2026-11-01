import { domainIdSchema } from '@nx-react-nestjs/contracts';
import { domainIdGenerator } from './domain-id';

describe('domainIdGenerator', () => {
  const newOrderId = domainIdGenerator('ORD');

  it('produces IDs that match the shared schema', () => {
    const schema = domainIdSchema('ORD');
    for (let i = 0; i < 1000; i++) {
      expect(schema.safeParse(newOrderId()).success).toBe(true);
    }
  });

  it('produces no duplicates, even within the same millisecond', () => {
    const sameInstant = domainIdGenerator('ORD', () => 1_792_000_000_000);
    const ids = new Set(Array.from({ length: 50_000 }, sameInstant));
    expect(ids.size).toBe(50_000);
  });

  it('sorts by creation order, to the millisecond', () => {
    const instants = [0, 1, 31, 32, 1_792_000_000_000, 1_792_000_000_001, 2 ** 45 - 1];
    const ids = instants.map((ms) => domainIdGenerator('ORD', () => ms)());
    // Tri par octets, comme Postgres avec COLLATE "C".
    expect([...ids].sort()).toEqual(ids);
  });

  it('rejects a malformed prefix at declaration', () => {
    expect(() => domainIdGenerator('Order')).toThrow('Invalid domain id prefix');
  });
});
