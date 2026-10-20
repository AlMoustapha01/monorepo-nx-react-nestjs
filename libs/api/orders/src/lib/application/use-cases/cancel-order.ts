import { Injectable } from '@nestjs/common';
import type { Order } from '../../domain/order';
import { OrderRepository } from '../order.repository';
import { GetOrder } from './get-order';

@Injectable()
export class CancelOrder {
  constructor(
    private readonly getOrder: GetOrder,
    private readonly orders: OrderRepository,
  ) {}

  async execute(id: string): Promise<Order> {
    const order = await this.getOrder.execute(id);
    order.cancel(new Date());
    await this.orders.update(order);
    return order;
  }
}
