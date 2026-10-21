import { PersistenceMapper } from '@nx-react-nestjs/api-core';
import { currencySchema } from '@nx-react-nestjs/contracts';
import { Order } from '../domain/order';
import type { OrderLineRow, OrderRow } from './orders.schema';

/** Un agrégat, deux tables : la commande et ses lignes voyagent ensemble. */
export interface OrderRecord {
  order: OrderRow;
  lines: OrderLineRow[];
}

export class OrderMapper extends PersistenceMapper<Order, OrderRecord> {
  toDomain({ order, lines }: OrderRecord): Order {
    return Order.restore({
      id: order.id,
      tenantId: order.tenantId,
      customerId: order.customerId,
      currency: currencySchema.parse(order.currency),
      status: order.status,
      version: order.version,
      lines: [...lines]
        .sort((a, b) => a.position - b.position)
        .map((line) => ({
          productId: line.productId,
          sku: line.sku,
          name: line.name,
          unitPriceMinor: line.unitPriceAmountMinor,
          quantity: line.quantity,
        })),
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    });
  }

  toRow(order: Order): OrderRecord {
    return {
      order: {
        id: order.id,
        tenantId: order.tenantId,
        customerId: order.customerId,
        currency: order.currency,
        status: order.status,
        version: order.version,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
      },
      lines: order.lines.map((line, position) => ({
        orderId: order.id,
        tenantId: order.tenantId,
        position,
        productId: line.productId,
        sku: line.sku,
        name: line.name,
        unitPriceAmountMinor: line.unitPriceMinor,
        quantity: line.quantity,
      })),
    };
  }
}
