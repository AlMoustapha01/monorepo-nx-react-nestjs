import { z } from 'zod';
import { moneySchema, productIdSchema } from '../catalog/product';
import { domainIdSchema } from '../domain-id';
import { cursorPageSchema } from '../pagination';

export const ORDER_ID_PREFIX = 'ORD';
export const orderIdSchema = domainIdSchema(ORDER_ID_PREFIX);

export const MAX_ORDER_LINES = 50;
export const MAX_LINE_QUANTITY = 99;

export const orderStatusSchema = z.enum(['placed', 'cancelled']);
export type OrderStatus = z.infer<typeof orderStatusSchema>;

export const placeOrderSchema = z.object({
  lines: z
    .array(
      z.object({
        productId: productIdSchema,
        quantity: z.number().int().min(1).max(MAX_LINE_QUANTITY),
      }),
    )
    .min(1)
    .max(MAX_ORDER_LINES),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const orderLineSchema = z.object({
  productId: productIdSchema,
  sku: z.string(),
  name: z.string(),
  unitPrice: moneySchema,
  quantity: z.number().int(),
  subtotal: moneySchema,
});

export const orderSchema = z.object({
  id: orderIdSchema,
  // Identifiant du fournisseur d'identité (claim `sub`), pas un ID métier.
  customerId: z.uuid(),
  status: orderStatusSchema,
  lines: z.array(orderLineSchema),
  total: moneySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type OrderResponse = z.infer<typeof orderSchema>;

export const orderPageSchema = cursorPageSchema(orderSchema);
