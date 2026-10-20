// Lu par drizzle-kit pour générer les migrations : ce fichier n'importe que drizzle-orm.
import {
  bigint,
  char,
  customType,
  index,
  integer,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** ID métier `PRD-…`, comparé octet par octet pour un tri stable quelle que soit la locale. */
const domainId = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });

/** Le domaine catalogue possède son schéma Postgres ; aucun autre domaine n'y fait de jointure. */
export const catalog = pgSchema('catalog');

export const productStatus = catalog.enum('product_status', ['draft', 'active', 'archived']);

export const PRODUCTS_TENANT_SKU_KEY = 'products_tenant_sku_key';

export const products = catalog.table(
  'products',
  {
    id: domainId('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    sku: varchar('sku', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    description: text('description'),
    priceAmountMinor: bigint('price_amount_minor', { mode: 'number' }).notNull(),
    priceCurrency: char('price_currency', { length: 3 }).notNull(),
    status: productStatus('status').notNull(),
    soldCount: integer('sold_count').notNull().default(0),
    // Précision milliseconde = celle de Date en JS, pour des curseurs exacts.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    uniqueIndex(PRODUCTS_TENANT_SKU_KEY).on(table.tenantId, table.sku),
    index('products_tenant_keyset_idx').on(table.tenantId, table.createdAt.desc(), table.id.desc()),
  ],
);

export type ProductRow = typeof products.$inferSelect;
