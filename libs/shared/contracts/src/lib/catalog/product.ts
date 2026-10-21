import { z } from 'zod';
import { domainIdSchema } from '../domain-id';
import { cursorPageSchema } from '../pagination';

export const PRODUCT_ID_PREFIX = 'PRD';
export const productIdSchema = domainIdSchema(PRODUCT_ID_PREFIX);

export const currencySchema = z.enum(['EUR', 'USD', 'XOF']);
export type Currency = z.infer<typeof currencySchema>;

/** Montant en unités mineures (centimes) pour éviter les flottants. */
export const moneySchema = z.object({
  amountMinor: z.number().int().nonnegative(),
  currency: currencySchema,
});
export type Money = z.infer<typeof moneySchema>;

export const productStatusSchema = z.enum(['draft', 'active', 'archived']);
export type ProductStatus = z.infer<typeof productStatusSchema>;

export const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9][A-Z0-9-]{1,62}[A-Z0-9]$/, 'SKU: 3 à 64 caractères A-Z, 0-9 ou -');

export const createProductSchema = z.object({
  sku: skuSchema,
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional(),
  price: moneySchema,
});
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const changeProductPriceSchema = z.object({
  price: moneySchema,
});
export type ChangeProductPriceInput = z.infer<typeof changeProductPriceSchema>;

export const productSchema = z.object({
  id: productIdSchema,
  sku: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  price: moneySchema,
  status: productStatusSchema,
  /** Unités vendues (commandes passées moins commandes annulées), mis à jour en asynchrone. */
  soldCount: z.number().int().nonnegative(),
  /** À renvoyer dans `If-Match` (via l'en-tête ETag) pour une modification sans écrasement. */
  version: z.number().int().positive(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export type ProductResponse = z.infer<typeof productSchema>;

export const productPageSchema = cursorPageSchema(productSchema);
