import { Injectable } from '@nestjs/common';
import {
  type Database,
  InjectDatabase,
  isUniqueViolation,
  type KeysetCursor,
  RequestContext,
} from '@nx-react-nestjs/api-core';
import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { ProductRepository, type ProductListPage } from '../application/product.repository';
import { skuAlreadyExists } from '../application/use-cases/create-product';
import type { Product } from '../domain/product';
import { PRODUCTS_TENANT_SKU_KEY, products } from './catalog.schema';
import { ProductMapper } from './product.mapper';

@Injectable()
export class DrizzleProductRepository extends ProductRepository {
  private readonly mapper = new ProductMapper();

  constructor(
    @InjectDatabase() private readonly db: Database,
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
    const rows = await this.db
      .select()
      .from(products)
      .where(and(this.tenantScope(), inArray(products.id, [...ids])));
    return this.mapper.toDomainList(rows);
  }

  async list({ limit, after }: { limit: number; after?: KeysetCursor }): Promise<ProductListPage> {
    const rows = await this.db
      .select()
      .from(products)
      .where(
        and(
          this.tenantScope(),
          after &&
            sql`(${products.createdAt}, ${products.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id}::uuid)`,
        ),
      )
      .orderBy(desc(products.createdAt), desc(products.id))
      .limit(limit + 1);
    return { items: this.mapper.toDomainList(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  async insert(product: Product): Promise<void> {
    try {
      await this.db
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
      ...changes
    } = this.mapper.toRow(product);
    await this.db
      .update(products)
      .set(changes)
      .where(and(this.tenantScope(), eq(products.id, id)));
  }

  private async findOne(condition: SQL): Promise<Product | null> {
    const [row] = await this.db
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
