import type { KeysetCursor, RequestContext } from '@nx-react-nestjs/api-core';
import type { ProductStatus } from '@nx-react-nestjs/contracts';
import { CatalogError } from '../../domain/catalog.errors';
import { Product } from '../../domain/product';
import {
  type ProductListPage,
  ProductRepository,
  type SoldCountChange,
} from '../product.repository';

/** Fake fidèle au contrat du port (tenant implicite, tri keyset), pour tester l'application sans base. */
export class InMemoryProductRepository extends ProductRepository {
  private readonly rows = new Map<string, Product>();

  constructor(private readonly context: RequestContext) {
    super();
  }

  async findById(id: string): Promise<Product | null> {
    return this.scoped().find((product) => product.id === id) ?? null;
  }

  async findBySku(sku: string): Promise<Product | null> {
    return this.scoped().find((product) => product.sku === sku) ?? null;
  }

  async findManyByIds(ids: readonly string[]): Promise<Product[]> {
    return this.scoped().filter((product) => ids.includes(product.id));
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
    const sorted = this.scoped()
      .filter((product) => !status || product.status === status)
      .sort((a, b) => compareKeyset(b, a))
      .filter((product) => !after || compareKeyset(product, after) < 0);
    return { items: sorted.slice(0, limit), hasMore: sorted.length > limit };
  }

  async insert(product: Product): Promise<void> {
    this.rows.set(product.id, clone(product, this.context.tenantId));
  }

  async update(product: Product): Promise<void> {
    const stored = this.rows.get(product.id);
    // Comme en base : une ligne d'un autre tenant ou déjà modifiée n'est pas écrite.
    if (stored?.tenantId !== this.context.tenantId || stored.version !== product.version) {
      throw new CatalogError(
        'PRODUCT_VERSION_CONFLICT',
        `Product ${product.id} was modified concurrently`,
      );
    }
    product.markPersisted();
    // Comme en base : `update` ne touche pas au compteur de ventes.
    this.rows.set(product.id, clone(product, stored.tenantId, stored.soldCount));
  }

  async adjustSoldCounts(changes: readonly SoldCountChange[]): Promise<void> {
    for (const { productId, delta } of changes) {
      const product = this.rows.get(productId);
      if (product?.tenantId === this.context.tenantId) {
        this.rows.set(
          productId,
          clone(product, product.tenantId, Math.max(product.soldCount + delta, 0)),
        );
      }
    }
  }

  private scoped(): Product[] {
    const tenantId = this.context.tenantId;
    return [...this.rows.values()]
      .filter((product) => product.tenantId === tenantId)
      .map((product) => clone(product, tenantId));
  }
}

function compareKeyset(a: KeysetCursor, b: KeysetCursor): number {
  // Comparaison par octets, comme les colonnes d'ID en COLLATE "C".
  return a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Copie pour que les tests ne voient pas de mutation non persistée. */
function clone(product: Product, tenantId: string, soldCount = product.soldCount): Product {
  return Product.restore({
    id: product.id,
    tenantId,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price,
    status: product.status,
    soldCount,
    version: product.version,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  });
}
