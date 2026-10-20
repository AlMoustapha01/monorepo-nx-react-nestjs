import type { KeysetCursor, RequestContext } from '@nx-react-nestjs/api-core';
import { Order } from '../../domain/order';
import { OrderRepository, type OrderListPage } from '../order.repository';

/** Fake fidèle au contrat du port (tenant implicite, tri keyset), pour tester l'application sans base. */
export class InMemoryOrderRepository extends OrderRepository {
  private readonly rows = new Map<string, Order>();

  constructor(private readonly context: RequestContext) {
    super();
  }

  async findById(id: string): Promise<Order | null> {
    return this.scoped().find((order) => order.id === id) ?? null;
  }

  async list({ limit, after }: { limit: number; after?: KeysetCursor }): Promise<OrderListPage> {
    const sorted = this.scoped()
      .sort((a, b) => compareKeyset(b, a))
      .filter((order) => !after || compareKeyset(order, after) < 0);
    return { items: sorted.slice(0, limit), hasMore: sorted.length > limit };
  }

  async insert(order: Order): Promise<void> {
    this.rows.set(order.id, clone(order, this.context.tenantId));
  }

  async update(order: Order): Promise<void> {
    if (this.rows.get(order.id)?.tenantId === this.context.tenantId) {
      this.rows.set(order.id, clone(order, this.context.tenantId));
    }
  }

  private scoped(): Order[] {
    const tenantId = this.context.tenantId;
    return [...this.rows.values()]
      .filter((order) => order.tenantId === tenantId)
      .map((order) => clone(order, tenantId));
  }
}

function compareKeyset(a: KeysetCursor, b: KeysetCursor): number {
  // Comparaison par octets, comme les colonnes d'ID en COLLATE "C".
  return a.createdAt.getTime() - b.createdAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Copie pour que les tests ne voient pas de mutation non persistée. */
function clone(order: Order, tenantId: string): Order {
  return Order.restore({
    id: order.id,
    tenantId,
    customerId: order.customerId,
    currency: order.currency,
    status: order.status,
    lines: order.lines,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
}
