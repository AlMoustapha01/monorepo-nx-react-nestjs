import { z } from 'zod';
import { moneySchema } from '../catalog/product';
import { cursorPageSchema } from '../pagination';

export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

export const orderStatusSchema = z.enum(['placed', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const placeOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: z.uuid(),
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
      }),
    )
    .min(1)
    .max(MAX_ORDER_LINES),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const orderLineSchema = z.object({
  productId: z.uuid(),
  sku: z.string(),
  name: z.string(),
  unitPrice: moneySchema,
  quantity: z.number().int(),
  subtotal: moneySchema,
});

export const orderSchema = z.object({
  id: z.uuid(),
  customerId: z.uuid(),
  status: orderStatusSchema,
  lines: z.array(orderLineSchema),
  total: moneySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type OrderResponse = z.infer<typeof orderSchema>;

export const orderPageSchema = cursorPageSchema(orderSchema);
