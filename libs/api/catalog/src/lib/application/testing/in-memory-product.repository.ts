import type { KeysetCursor, RequestContext } from '@nx-react-nestjs/api-core';
import { Product } from '../../domain/product';
import { ProductRepository, type ProductListPage } from '../product.repository';

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

  async list({ limit, after }: { limit: number; after?: KeysetCursor }): Promise<ProductListPage> {
    const sorted = this.scoped()
      .sort((a, b) => compareKeyset(b, a))
      .filter((product) => !after || compareKeyset(product, after) < 0);
    return { items: sorted.slice(0, limit), hasMore: sorted.length > limit };
  }

  async insert(product: Product): Promise<void> {
    this.rows.set(product.id, clone(product, this.context.tenantId));
  }

  async update(product: Product): Promise<void> {
    if (this.rows.get(product.id)?.tenantId === this.context.tenantId) {
      this.rows.set(product.id, clone(product, this.context.tenantId));
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
function clone(product: Product, tenantId: string): Product {
  return Product.restore({
    id: product.id,
    tenantId,
    sku: product.sku,
    name: product.name,
    description: product.description,
    price: product.price,
    status: product.status,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
  });
}
