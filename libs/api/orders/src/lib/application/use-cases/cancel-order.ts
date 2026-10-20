import { Injectable } from '@nestjs/common';
import { Outbox, TransactionManager } from '@nx-react-nestjs/api-core';
import { OrderCancelled } from '@nx-react-nestjs/contracts';
import type { Order } from '../../domain/order';
import { OrderRepository } from '../order.repository';
import { GetOrder } from './get-order';

@Injectable()
export class CancelOrder {
  constructor(
    private readonly getOrder: GetOrder,
    private readonly orders: OrderRepository,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
  ) {}

  async execute(id: string): Promise<Order> {
    const order = await this.getOrder.execute(id);
    const wasPlaced = order.status === 'placed';
    order.cancel(new Date());
    if (!wasPlaced) {
      // Annulation idempotente : rien n'a changé, rien à annoncer.
      return order;
    }

    await this.transactions.transaction(async () => {
      await this.orders.update(order);
      await this.outbox.publish(OrderCancelled, {
        orderId: order.id,
        lines: order.lines.map(({ productId, quantity }) => ({ productId, quantity })),
        cancelledAt: order.updatedAt.toISOString(),
      });
    });
    return order;
  }
}
