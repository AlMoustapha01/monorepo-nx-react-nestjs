import { Injectable } from '@nestjs/common';
import {
  DatabaseSession,
  isUniqueViolation,
  type KeysetCursor,
  RequestContext,
} from '@nx-react-nestjs/api-core';
import type { ProductStatus } from '@nx-react-nestjs/contracts';
import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import {
  type ProductListPage,
  ProductRepository,
  type SoldCountChange,
} from '../application/product.repository';
import { skuAlreadyExists } from '../application/use-cases/create-product';
import type { Product } from '../domain/product';
import { PRODUCTS_TENANT_SKU_KEY, products } from './catalog.schema';
import { ProductMapper } from './product.mapper';

@Injectable()
export class DrizzleProductRepository extends ProductRepository {
  private readonly mapper = new ProductMapper();

  constructor(
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
  ) {
    super();
  }

  async findById(id: string): Promise<Product | null> {
    return this.findOne(eq(products.id, id));
  }

  async findBySku(sku: string): Promise<Product | null> {
    return this.findOne(eq(products.sku, sku));
  }

  async findManyByIds(ids: readonly string[]): Promise<Product[]> {
    if (ids.length === 0) {
      return [];
    }
    const rows = await this.session.db
      .select()
      .from(products)
      .where(and(this.tenantScope(), inArray(products.id, [...ids])));
    return this.mapper.toDomainList(rows);
  }

  async list({
    limit,
    after,
    status,
  }: {
    limit: number;
    after?: KeysetCursor;
    status?: ProductStatus;
  }): Promise<ProductListPage> {
    const rows = await this.session.db
      .select()
      .from(products)
      .where(
        and(
          this.tenantScope(),
          status && eq(products.status, status),
          after &&
            sql`(${products.createdAt}, ${products.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id})`,
        ),
      )
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(limit + 1);
    return { items: this.mapper.toDomainList(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  async insert(product: Product): Promise<void> {
    try {
      await this.session.db
        .insert(products)
        .values({ ...this.mapper.toRow(product), tenantId: this.context.tenantId });
    } catch (error) {
      // Filet de sécurité si deux requêtes créent le même SKU en même temps.
      if (isUniqueViolation(error, PRODUCTS_TENANT_SKU_KEY)) {
        throw skuAlreadyExists(product.sku);
      }
      throw error;
    }
  }

  async update(product: Product): Promise<void> {
    const {
      id,
      tenantId: _tenantId,
      createdAt: _createdAt,
      soldCount: _soldCount,
      ...changes
    } = this.mapper.toRow(product);
    await this.session.db
      .update(products)
      .set(changes)
      .where(and(this.tenantScope(), eq(products.id, id)));
  }

  async adjustSoldCounts(changes: readonly SoldCountChange[]): Promise<void> {
    for (const { productId, delta } of changes) {
      await this.session.db
        .update(products)
        // Jamais négatif, même si une annulation arrive avant la vente qu'elle compense.
        .set({ soldCount: sql`greatest(${products.soldCount} + ${delta}, 0)` })
        .where(and(this.tenantScope(), eq(products.id, productId)));
    }
  }

  private async findOne(condition: SQL): Promise<Product | null> {
    const [row] = await this.session.db
      .select()
      .from(products)
      .where(and(this.tenantScope(), condition))
      .limit(1);
    return row ? this.mapper.toDomain(row) : null;
  }

  /** Toute requête passe par ici : pas de lecture ni d'écriture hors du tenant courant. */
  private tenantScope(): SQL {
    return eq(products.tenantId, this.context.tenantId);
  }
}
