import { randomUUID } from 'node:crypto';
import { domainIdGenerator } from '@nx-react-nestjs/api-core';
import { ZodError } from 'zod';
import { OrderMapper, type OrderRecord } from './order.mapper';

describe('OrderMapper', () => {
  const mapper = new OrderMapper();
  const orderId = domainIdGenerator('ORD')();
  const tenantId = randomUUID();
  const line = (position: number, sku: string) => ({
    orderId,
    tenantId,
    position,
    productId: domainIdGenerator('PRD')(),
    sku,
    name: `Product ${sku}`,
    unitPriceAmountMinor: 1990,
    quantity: 2,
  });
  const record: OrderRecord = {
    order: {
      id: orderId,
      tenantId,
      customerId: randomUUID(),
      currency: 'EUR',
      status: 'placed',
      createdAt: new Date('2026-10-20T10:00:00.000Z'),
      updatedAt: new Date('2026-10-20T10:00:00.000Z'),
    },
    lines: [line(0, 'TEE-01'), line(1, 'MUG-01')],
  };

  it('restitue l’enregistrement d’origine après un aller-retour', () => {
    expect(mapper.toRow(mapper.toDomain(record))).toEqual(record);
  });

  it('remet les lignes dans leur ordre, quel que soit l’ordre de lecture', () => {
    const shuffled = { ...record, lines: [...record.lines].reverse() };
    expect(mapper.toDomain(shuffled).lines.map((l) => l.sku)).toEqual(['TEE-01', 'MUG-01']);
  });

  it('refuse une devise inconnue lue en base', () => {
    expect(() =>
      mapper.toDomain({ ...record, order: { ...record.order, currency: 'GBP' } }),
    ).toThrow(ZodError);
  });
});
