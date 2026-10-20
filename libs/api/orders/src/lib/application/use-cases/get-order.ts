import { Injectable } from '@nestjs/common';
import type { Order } from '../../domain/order';
import { OrdersError } from '../../domain/orders.errors';
import { OrderRepository } from '../order.repository';

@Injectable()
export class GetOrder {
  constructor(private readonly orders: OrderRepository) {}

  async execute(id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    if (!order) {
      // Même réponse qu'une commande d'un autre tenant : on ne révèle pas son existence.
      throw new OrdersError('ORDER_NOT_FOUND', `Order ${id} not found`, { orderId: id });
    }
    return order;
  }
}
