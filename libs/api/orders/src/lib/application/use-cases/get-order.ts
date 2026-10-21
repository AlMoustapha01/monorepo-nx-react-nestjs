import { Injectable } from '@nestjs/common';
import { RequestContext } from '@nx-react-nestjs/api-core';
import type { Order } from '../../domain/order';
import { OrdersError } from '../../domain/orders.errors';
import { OrderRepository } from '../order.repository';

@Injectable()
export class GetOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly context: RequestContext,
  ) {}

  async execute(id: string): Promise<Order> {
    const order = await this.orders.findById(id);
    // Un client n'accède qu'à ses commandes ; le staff à toutes celles du tenant.
    // Même réponse qu'une commande inexistante ou d'un autre tenant : on ne révèle rien.
    if (!order || !this.canAccess(order)) {
      throw new OrdersError('ORDER_NOT_FOUND', `Order ${id} not found`, { orderId: id });
    }
    return order;
  }

  private canAccess(order: Order): boolean {
    return this.context.hasRole('staff') || order.customerId === this.context.userId;
  }
}
