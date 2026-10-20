import { Injectable } from '@nestjs/common';
import {
  type Database,
  InjectDatabase,
  type KeysetCursor,
  RequestContext,
} from '@nx-react-nestjs/api-core';
import { and, desc, eq, inArray, type SQL, sql } from 'drizzle-orm';
import { OrderRepository, type OrderListPage } from '../application/order.repository';
import type { Order } from '../domain/order';
import { OrderMapper } from './order.mapper';
import { type OrderRow, orderLines, orders } from './orders.schema';

@Injectable()
export class DrizzleOrderRepository extends OrderRepository {
  private readonly mapper = new OrderMapper();

  constructor(
    @InjectDatabase() private readonly db: Database,
    private readonly context: RequestContext,
  ) {
    super();
  }

  async findById(id: string): Promise<Order | null> {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(and(this.tenantScope(), eq(orders.id, id)))
      .limit(1);
    return order ? ((await this.withLines([order]))[0] ?? null) : null;
  }

  async list({ limit, after }: { limit: number; after?: KeysetCursor }): Promise<OrderListPage> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(
        and(
          this.tenantScope(),
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
    await this.db.transaction(async (tx) => {
      await tx.insert(orders).values({ ...record.order, tenantId });
      await tx.insert(orderLines).values(record.lines.map((line) => ({ ...line, tenantId })));
    });
  }

  async update(order: Order): Promise<void> {
    const { status, updatedAt } = this.mapper.toRow(order).order;
    await this.db
      .update(orders)
      .set({ status, updatedAt })
      .where(and(this.tenantScope(), eq(orders.id, order.id)));
  }

  /** Charge les lignes de plusieurs commandes en une requête, pour éviter le N+1. */
  private async withLines(rows: OrderRow[]): Promise<Order[]> {
    if (rows.length === 0) {
      return [];
    }
    const lines = await this.db
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
