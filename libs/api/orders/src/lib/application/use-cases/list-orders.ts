import { Injectable } from '@nestjs/common';
import { decodeCursor, encodeCursor, RequestContext } from '@nx-react-nestjs/api-core';
import type { CursorPage, CursorPageQuery } from '@nx-react-nestjs/contracts';
import type { Order } from '../../domain/order';
import { OrderRepository } from '../order.repository';

@Injectable()
export class ListOrders {
  constructor(
    private readonly orders: OrderRepository,
    private readonly context: RequestContext,
  ) {}

  async execute({ limit, cursor }: CursorPageQuery): Promise<CursorPage<Order>> {
    const page = await this.orders.list({
      limit,
      after: cursor ? decodeCursor(cursor) : undefined,
      customerId: this.context.hasRole('staff') ? undefined : this.context.userId,
    });
    const last = page.items.at(-1);
    return {
      items: page.items,
      nextCursor: page.hasMore && last ? encodeCursor(last) : null,
    };
  }
}
