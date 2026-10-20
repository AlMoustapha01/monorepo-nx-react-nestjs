import { randomUUID } from 'node:crypto';
import { domainIdGenerator } from '@nx-react-nestjs/api-core';
import {
  createTestRequestContext,
  startTestDatabase,
  type TestDatabase,
} from '@nx-react-nestjs/api-core/testing';
import { Money } from '../domain/money';
import { Product } from '../domain/product';
import { DrizzleProductRepository } from './drizzle-product.repository';

const newProductId = domainIdGenerator('PRD');

describe('DrizzleProductRepository (Postgres réel)', () => {
  const context = createTestRequestContext();
  const tenantA = { userId: randomUUID(), tenantId: randomUUID() };
  const tenantB = { userId: randomUUID(), tenantId: randomUUID() };
  let database: TestDatabase;
  let repository: DrizzleProductRepository;

  beforeAll(async () => {
    database = await startTestDatabase();
    repository = new DrizzleProductRepository(database.db, context);
  });

  afterAll(() => database?.stop());

  const newProduct = (tenantId: string, sku: string, createdAt = new Date()) =>
    Product.create({
      id: newProductId(),
      tenantId,
      sku,
      name: `Product ${sku}`,
      description: null,
      price: Money.of(1990, 'EUR'),
      now: createdAt,
    });

  it('relit fidèlement ce qu’il a écrit', () =>
    context.runAs(tenantA, async () => {
      const product = newProduct(tenantA.tenantId, 'ROUND-TRIP');
      await repository.insert(product);
      product.publish(new Date());
      await repository.update(product);

      const found = await repository.findById(product.id);
      expect(found).toMatchObject({
        sku: 'ROUND-TRIP',
        status: 'active',
        updatedAt: product.updatedAt,
      });
      expect(found?.price.equals(product.price)).toBe(true);
    }));

  it('ne lit ni ne modifie jamais les produits d’un autre tenant', async () => {
    const foreign = newProduct(tenantB.tenantId, 'FOREIGN');
    await context.runAs(tenantB, () => repository.insert(foreign));

    await context.runAs(tenantA, async () => {
      expect(await repository.findById(foreign.id)).toBeNull();
      expect(await repository.findBySku('FOREIGN')).toBeNull();
      expect(await repository.findManyByIds([foreign.id])).toEqual([]);

      foreign.archive(new Date());
      await repository.update(foreign);
    });

    const untouched = await context.runAs(tenantB, () => repository.findById(foreign.id));
    expect(untouched?.status).toBe('draft');
  });

  it('écrit toujours dans le tenant du contexte, pas celui de l’entité', async () => {
    const forged = newProduct(tenantB.tenantId, 'FORGED');
    await context.runAs(tenantA, () => repository.insert(forged));

    expect(await context.runAs(tenantB, () => repository.findById(forged.id))).toBeNull();
    expect(await context.runAs(tenantA, () => repository.findById(forged.id))).not.toBeNull();
  });

  it('traduit la contrainte d’unicité SKU en erreur métier', () =>
    context.runAs(tenantA, async () => {
      await repository.insert(newProduct(tenantA.tenantId, 'DUP'));
      await expect(repository.insert(newProduct(tenantA.tenantId, 'DUP'))).rejects.toMatchObject({
        code: 'SKU_ALREADY_EXISTS',
      });
    }));

  it('pagine par (created_at, id) décroissants, y compris à horodatage égal', async () => {
    const tenant = { userId: randomUUID(), tenantId: randomUUID() };
    const sameInstant = new Date('2026-10-20T10:00:00.000Z');
    const inserted = ['P-1', 'P-2', 'P-3', 'P-4', 'P-5'].map((sku) =>
      newProduct(tenant.tenantId, sku, sameInstant),
    );

    await context.runAs(tenant, async () => {
      for (const product of inserted) {
        await repository.insert(product);
      }

      const first = await repository.list({ limit: 3 });
      const last = first.items.at(-1);
      expect(first.hasMore).toBe(true);
      expect(last).toBeDefined();

      const second = await repository.list({ limit: 3, after: last });
      expect(second.hasMore).toBe(false);

      const ids = [...first.items, ...second.items].map((product) => product.id);
      expect(ids).toEqual(
        inserted
          .map((product) => product.id)
          .sort()
          .reverse(),
      );
    });
  });
});
