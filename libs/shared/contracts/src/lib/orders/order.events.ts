import { z } from 'zod';
import { currencySchema, productIdSchema } from '../catalog/product';
import { defineIntegrationEvent } from '../integration-event';
import { orderIdSchema } from './order';

/**
 * Publié quand une commande est passée. Le payload porte tout ce dont les consommateurs ont
 * besoin (« event-carried state transfer ») : aucun ne rappelle le domaine commandes.
 */
export const OrderPlaced = defineIntegrationEvent(
  'orders.order-placed.v1',
  z.object({
    orderId: orderIdSchema,
    customerId: z.uuid(),
    /** Null si le token ne portait pas d'email : pas de confirmation possible. */
    customerEmail: z.email().nullable(),
    currency: currencySchema,
    totalMinor: z.number().int().nonnegative(),
    lines: z.array(
      z.object({
        productId: productIdSchema,
        sku: z.string(),
        name: z.string(),
        unitPriceMinor: z.number().int().nonnegative(),
        quantity: z.number().int().positive(),
      }),
    ),
    placedAt: z.iso.datetime(),
  }),
);

/** Publié une seule fois, quand une commande passe de « placed » à « cancelled ». */
export const OrderCancelled = defineIntegrationEvent(
  'orders.order-cancelled.v1',
  z.object({
    orderId: orderIdSchema,
    lines: z.array(z.object({ productId: productIdSchema, quantity: z.number().int().positive() })),
    cancelledAt: z.iso.datetime(),
  }),
);
