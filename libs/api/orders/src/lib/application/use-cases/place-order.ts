import { Injectable } from '@nestjs/common';
import {
  domainIdGenerator,
  Outbox,
  RequestContext,
  TransactionManager,
} from '@nx-react-nestjs/api-core';
import { ORDER_ID_PREFIX, OrderPlaced, type PlaceOrderInput } from '@nx-react-nestjs/contracts';
import { Order, type OrderLine } from '../../domain/order';
import { OrdersError } from '../../domain/orders.errors';
import { OrderRepository } from '../order.repository';
import { ProductCatalog } from '../product-catalog.port';

const newOrderId = domainIdGenerator(ORDER_ID_PREFIX);

@Injectable()
export class PlaceOrder {
  constructor(
    private readonly orders: OrderRepository,
    private readonly catalog: ProductCatalog,
    private readonly context: RequestContext,
    private readonly transactions: TransactionManager,
    private readonly outbox: Outbox,
  ) {}

  async execute(input: PlaceOrderInput): Promise<Order> {
    const requestedIds = input.lines.map((line) => line.productId);
    const products = new Map(
      (await this.catalog.getProducts(requestedIds)).map((product) => [product.id, product]),
    );

    const lines: OrderLine[] = [];
    const unavailable: string[] = [];
    for (const { productId, quantity } of input.lines) {
      const product = products.get(productId);
      if (!product?.purchasable) {
        unavailable.push(productId);
        continue;
      }
      lines.push({
        productId,
        sku: product.sku,
        name: product.name,
        unitPriceMinor: product.price.amountMinor,
        quantity,
      });
    }
    // Inconnu, d'un autre tenant ou non publié : même réponse, on ne révèle rien.
    if (unavailable.length > 0) {
      throw new OrdersError('PRODUCT_UNAVAILABLE', 'Some products cannot be ordered', {
        productIds: unavailable,
      });
    }

    const currencies = new Set([...products.values()].map((product) => product.price.currency));
    const [currency] = currencies;
    if (currencies.size !== 1 || !currency) {
      throw new OrdersError('CURRENCY_MISMATCH', 'All products of an order must share a currency', {
        currencies: [...currencies],
      });
    }

    const order = Order.place({
      id: newOrderId(),
      tenantId: this.context.tenantId,
      customerId: this.context.userId,
      currency,
      lines,
      now: new Date(),
    });
    // La commande et son événement sont écrits ensemble, ou pas du tout.
    await this.transactions.transaction(async () => {
      await this.orders.insert(order);
      await this.outbox.publish(OrderPlaced, {
        orderId: order.id,
        customerId: order.customerId,
        customerEmail: this.context.principal?.email ?? null,
        currency: order.currency,
        totalMinor: order.totalMinor,
        lines: order.lines.map((line) => ({ ...line })),
        placedAt: order.createdAt.toISOString(),
      });
    });
    return order;
  }
}
