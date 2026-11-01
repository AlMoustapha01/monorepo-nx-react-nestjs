import { randomUUID } from 'node:crypto';
import { domainIdGenerator } from '@nx-react-nestjs/api-core';
import { ZodError } from 'zod';
import type { ProductRow } from './catalog.schema';
import { ProductMapper } from './product.mapper';

describe('ProductMapper', () => {
  const mapper = new ProductMapper();
  const row: ProductRow = {
    id: domainIdGenerator('PRD')(),
    tenantId: randomUUID(),
    sku: 'TEE-BLANC-M',
    name: 'Tee-shirt',
    description: null,
    priceAmountMinor: 1990,
    priceCurrency: 'EUR',
    status: 'active',
    soldCount: 12,
    version: 4,
    createdAt: new Date('2026-10-20T10:00:00.000Z'),
    updatedAt: new Date('2026-10-20T11:00:00.000Z'),
  };

  it('restores the original row after a round trip', () => {
    expect(mapper.toRow(mapper.toDomain(row))).toEqual(row);
  });

  it('rejects an unknown currency read from the database', () => {
    expect(() => mapper.toDomain({ ...row, priceCurrency: 'GBP' })).toThrow(ZodError);
  });

  it('converts a list of rows', () => {
    expect(mapper.toDomainList([row, row]).map((product) => product.sku)).toEqual([
      'TEE-BLANC-M',
      'TEE-BLANC-M',
    ]);
  });
});
