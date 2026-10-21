import type { KeysetCursor, RequestContext } from '@nx-react-nestjs/api-core';
import { Order } from '../../domain/order';
import { OrdersError } from '../../domain/orders.errors';
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

  async list({
    limit,
    after,
    customerId,
  }: {
    limit: number;
    after?: KeysetCursor;
    customerId?: string;
  }): Promise<OrderListPage> {
    const sorted = this.scoped()
      .filter((order) => customerId === undefined || order.customerId === customerId)
      .sort((a, b) => compareKeyset(b, a))
      .filter((order) => !after || compareKeyset(order, after) < 0);
    return { items: sorted.slice(0, limit), hasMore: sorted.length > limit };
  }

  async insert(order: Order): Promise<void> {
    this.rows.set(order.id, clone(order, this.context.tenantId));
  }

  async update(order: Order): Promise<void> {
    const stored = this.rows.get(order.id);
    // Comme en base : une ligne d'un autre tenant ou déjà modifiée n'est pas écrite.
    if (stored?.tenantId !== this.context.tenantId || stored.version !== order.version) {
      throw new OrdersError(
        'ORDER_VERSION_CONFLICT',
        `Order ${order.id} was modified concurrently`,
      );
    }
    order.markPersisted();
    this.rows.set(order.id, clone(order, stored.tenantId));
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
    version: order.version,
    lines: order.lines,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  });
}
