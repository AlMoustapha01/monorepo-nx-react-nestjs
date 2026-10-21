import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Idempotent } from '@nx-react-nestjs/api-core';
import {
  type CursorPage,
  cursorPageQuerySchema,
  type OrderResponse,
  orderIdSchema,
  orderPageSchema,
  orderSchema,
  placeOrderSchema,
} from '@nx-react-nestjs/contracts';
import { createZodDto, ZodSerializerDto } from 'nestjs-zod';
import { z } from 'zod';
import { lineSubtotalMinor, type Order } from '../domain/order';
import { CancelOrder } from '../application/use-cases/cancel-order';
import { GetOrder } from '../application/use-cases/get-order';
import { ListOrders } from '../application/use-cases/list-orders';
import { PlaceOrder } from '../application/use-cases/place-order';

class PlaceOrderDto extends createZodDto(placeOrderSchema) {}
class ListOrdersQueryDto extends createZodDto(cursorPageQuerySchema) {}
class OrderIdParamsDto extends createZodDto(z.object({ id: orderIdSchema })) {}
class OrderDto extends createZodDto(orderSchema) {}
class OrderPageDto extends createZodDto(orderPageSchema) {}

/** Couche fine : valider (DTO zod), appeler un cas d'usage, sérialiser. Aucune règle métier ici. */
@ApiTags('orders')
@ApiBearerAuth()
@Controller({ path: 'orders', version: '1' })
export class OrdersController {
  constructor(
    private readonly placeOrder: PlaceOrder,
    private readonly getOrder: GetOrder,
    private readonly listOrders: ListOrders,
    private readonly cancelOrder: CancelOrder,
  ) {}

  @Post()
  // Un retry (timeout, réseau) ne doit jamais créer une seconde commande.
  @Idempotent({ required: true })
  @ZodSerializerDto(OrderDto)
  async place(@Body() body: PlaceOrderDto): Promise<OrderResponse> {
    return toResponse(await this.placeOrder.execute(body));
  }

  @Get()
  @ZodSerializerDto(OrderPageDto)
  async list(@Query() query: ListOrdersQueryDto): Promise<CursorPage<OrderResponse>> {
    const page = await this.listOrders.execute(query);
    return { items: page.items.map(toResponse), nextCursor: page.nextCursor };
  }

  @Get(':id')
  @ZodSerializerDto(OrderDto)
  async get(@Param() { id }: OrderIdParamsDto): Promise<OrderResponse> {
    return toResponse(await this.getOrder.execute(id));
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @ZodSerializerDto(OrderDto)
  async cancel(@Param() { id }: OrderIdParamsDto): Promise<OrderResponse> {
    return toResponse(await this.cancelOrder.execute(id));
  }
}

function toResponse(order: Order): OrderResponse {
  const money = (amountMinor: number) => ({ amountMinor, currency: order.currency });
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status,
    lines: order.lines.map((line) => ({
      productId: line.productId,
      sku: line.sku,
      name: line.name,
      unitPrice: money(line.unitPriceMinor),
      quantity: line.quantity,
      subtotal: money(lineSubtotalMinor(line)),
    })),
    total: money(order.totalMinor),
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
  };
}
