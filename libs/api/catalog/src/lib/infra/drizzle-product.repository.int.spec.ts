import { randomUUID } from 'node:crypto';
import { DatabaseSession, domainIdGenerator } from '@nx-react-nestjs/api-core';
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
    repository = new DrizzleProductRepository(new DatabaseSession(database.db), context);
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
      // L'écriture conditionnelle ne trouve aucune ligne de ce tenant : rien n'est écrit.
      await expect(repository.update(foreign)).rejects.toMatchObject({
        code: 'PRODUCT_VERSION_CONFLICT',
      });
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

  it('ajuste les ventes de façon atomique, sans que update les écrase', () =>
    context.runAs(tenantA, async () => {
      const product = newProduct(tenantA.tenantId, 'SOLD');
      await repository.insert(product);

      await Promise.all([
        repository.adjustSoldCounts([{ productId: product.id, delta: 2 }]),
        repository.adjustSoldCounts([{ productId: product.id, delta: 3 }]),
      ]);
      // L'entité en mémoire a encore soldCount = 0 : update ne doit pas l'écrire.
      product.publish(new Date());
      await repository.update(product);
      await repository.adjustSoldCounts([{ productId: product.id, delta: -10 }]);
      await repository.adjustSoldCounts([{ productId: product.id, delta: 4 }]);

      expect((await repository.findById(product.id))?.soldCount).toBe(4);
    }));

  it('n’ajuste pas les ventes d’un produit d’un autre tenant', async () => {
    const foreign = newProduct(tenantB.tenantId, 'SOLD-FOREIGN');
    await context.runAs(tenantB, () => repository.insert(foreign));
    await context.runAs(tenantA, () =>
      repository.adjustSoldCounts([{ productId: foreign.id, delta: 5 }]),
    );
    const untouched = await context.runAs(tenantB, () => repository.findById(foreign.id));
    expect(untouched?.soldCount).toBe(0);
  });

  it('filtre la liste par statut', async () => {
    const tenant = { userId: randomUUID(), tenantId: randomUUID() };
    await context.runAs(tenant, async () => {
      const draft = newProduct(tenant.tenantId, 'STATUS-DRAFT');
      const active = newProduct(tenant.tenantId, 'STATUS-ACTIVE');
      await repository.insert(draft);
      await repository.insert(active);
      active.publish(new Date());
      await repository.update(active);

      const page = await repository.list({ limit: 10, status: 'active' });
      expect(page.items.map((product) => product.sku)).toEqual(['STATUS-ACTIVE']);
    });
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

  it('verrou optimiste : avance la version et refuse une copie périmée', () =>
    context.runAs(tenantA, async () => {
      const product = newProduct(tenantA.tenantId, 'LOCKED');
      await repository.insert(product);

      const [first, second] = [
        await repository.findById(product.id),
        await repository.findById(product.id),
      ];
      first?.changePrice(Money.of(2500, 'EUR'), new Date());
      await repository.update(first!);
      expect(first?.version).toBe(2);

      second?.changePrice(Money.of(3000, 'EUR'), new Date());
      await expect(repository.update(second!)).rejects.toMatchObject({
        code: 'PRODUCT_VERSION_CONFLICT',
      });

      const stored = await repository.findById(product.id);
      expect(stored).toMatchObject({ version: 2 });
      expect(stored?.price.amountMinor).toBe(2500);
    }));

  it('une vente n’avance pas la version', () =>
    context.runAs(tenantA, async () => {
      const product = newProduct(tenantA.tenantId, 'SALE-NO-VERSION');
      await repository.insert(product);
      await repository.adjustSoldCounts([{ productId: product.id, delta: 1 }]);
      expect((await repository.findById(product.id))?.version).toBe(1);
    }));
});
