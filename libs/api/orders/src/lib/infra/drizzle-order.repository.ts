import { Injectable } from '@nestjs/common';
import { DatabaseSession, type KeysetCursor, RequestContext } from '@nx-react-nestjs/api-core';
import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { OrderRepository, type OrderListPage } from '../application/order.repository';
import type { Order } from '../domain/order';
import { OrdersError } from '../domain/orders.errors';
import { OrderMapper } from './order.mapper';
import { type OrderRow, orderLines, orders } from './orders.schema';

@Injectable()
export class DrizzleOrderRepository extends OrderRepository {
  private readonly mapper = new OrderMapper();

  constructor(
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
  ) {
    super();
  }

  async findById(id: string): Promise<Order | null> {
    const [order] = await this.session.db
      .select()
      .from(orders)
      .where(and(this.tenantScope(), eq(orders.id, id)))
      .limit(1);
    return order ? ((await this.withLines([order]))[0] ?? null) : null;
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
    const rows = await this.session.db
      .select()
      .from(orders)
      .where(
        and(
          this.tenantScope(),
          // Test explicite : une chaîne vide doit filtrer (et ne rien trouver), pas tout ouvrir.
          customerId === undefined ? undefined : eq(orders.customerId, customerId),
          after &&
            sql`(${orders.createdAt}, ${orders.id}) < (${after.createdAt.toISOString()}::timestamptz, ${after.id})`,
        ),
      )
      .orderBy(desc(orders.createdAt), desc(orders.id))
      .limit(limit + 1);
    return { items: await this.withLines(rows.slice(0, limit)), hasMore: rows.length > limit };
  }

  async insert(order: Order): Promise<void> {
    const tenantId = this.context.tenantId;
    const record = this.mapper.toRow(order);
    // Rejoint la transaction du cas d'usage s'il en a ouvert une (ex. avec l'outbox).
    await this.session.transaction(async () => {
      await this.session.db.insert(orders).values({ ...record.order, tenantId });
      await this.session.db
        .insert(orderLines)
        .values(record.lines.map((line) => ({ ...line, tenantId })));
    });
  }

  async update(order: Order): Promise<void> {
    const { status, updatedAt, version } = this.mapper.toRow(order).order;
    const [written] = await this.session.db
      .update(orders)
      .set({ status, updatedAt, version: version + 1 })
      // Verrou optimiste : deux annulations simultanées ne publient pas deux OrderCancelled.
      .where(and(this.tenantScope(), eq(orders.id, order.id), eq(orders.version, version)))
      .returning({ id: orders.id });
    if (!written) {
      throw new OrdersError(
        'ORDER_VERSION_CONFLICT',
        `Order ${order.id} was modified concurrently`,
        {
          orderId: order.id,
        },
      );
    }
    order.markPersisted();
  }

  /** Charge les lignes de plusieurs commandes en une requête, pour éviter le N+1. */
  private async withLines(rows: OrderRow[]): Promise<Order[]> {
    if (rows.length === 0) {
      return [];
    }
    const lines = await this.session.db
      .select()
      .from(orderLines)
      .where(
        and(
          eq(orderLines.tenantId, this.context.tenantId),
          inArray(
            orderLines.orderId,
            rows.map((row) => row.id),
          ),
        ),
      );
    return this.mapper.toDomainList(
      rows.map((order) => ({ order, lines: lines.filter((line) => line.orderId === order.id) })),
    );
  }

  /** Toute requête passe par ici : pas de lecture ni d'écriture hors du tenant courant. */
  private tenantScope(): SQL {
    return eq(orders.tenantId, this.context.tenantId);
  }
}
