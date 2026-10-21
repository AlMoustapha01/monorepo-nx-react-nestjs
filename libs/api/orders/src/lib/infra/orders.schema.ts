// Lu par drizzle-kit pour générer les migrations : ce fichier n'importe que drizzle-orm.
import {
  bigint,
  char,
  customType,
  foreignKey,
  index,
  integer,
  pgSchema,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** ID métier `PRD-…` / `ORD-…`, comparé octet par octet pour un tri stable quelle que soit la locale. */
const domainId = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });

/** Le domaine commandes possède son schéma Postgres ; aucun autre domaine n'y fait de jointure. */
export const ordersSchema = pgSchema('orders');

export const orderStatus = ordersSchema.enum('order_status', ['placed', 'cancelled']);

export const orders = ordersSchema.table(
  'orders',
  {
    id: domainId('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    customerId: uuid('customer_id').notNull(),
    currency: char('currency', { length: 3 }).notNull(),
    status: orderStatus('status').notNull(),
    version: integer('version').notNull().default(1),
    // Précision milliseconde = celle de Date en JS, pour des curseurs exacts.
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    index('orders_tenant_keyset_idx').on(table.tenantId, table.createdAt.desc(), table.id.desc()),
    // « Mes commandes » : la liste d'un client, paginée dans le même ordre.
    index('orders_tenant_customer_keyset_idx').on(
      table.tenantId,
      table.customerId,
      table.createdAt.desc(),
      table.id.desc(),
    ),
  ],
);

export const orderLines = ordersSchema.table(
  'order_lines',
  {
    orderId: domainId('order_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    position: integer('position').notNull(),
    // Simple ID : pas de clé étrangère vers catalog.products, l'autre domaine reste maître chez lui.
    productId: domainId('product_id').notNull(),
    sku: varchar('sku', { length: 64 }).notNull(),
    name: varchar('name', { length: 200 }).notNull(),
    unitPriceAmountMinor: bigint('unit_price_amount_minor', { mode: 'number' }).notNull(),
    quantity: integer('quantity').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.orderId, table.position] }),
    foreignKey({ columns: [table.orderId], foreignColumns: [orders.id] }).onDelete('cascade'),
  ],
);

export type OrderRow = typeof orders.$inferSelect;
export type OrderLineRow = typeof orderLines.$inferSelect;
