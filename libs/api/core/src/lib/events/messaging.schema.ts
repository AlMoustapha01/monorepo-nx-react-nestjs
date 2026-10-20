// Lu par drizzle-kit pour générer les migrations : ce fichier n'importe que drizzle-orm.
import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** ID métier `EVT-…`, comparé octet par octet pour un tri stable quelle que soit la locale. */
const domainId = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });

/** Infrastructure de messagerie, commune à tous les domaines. */
export const messaging = pgSchema('messaging');

/** Événements écrits dans la transaction métier, puis relayés vers BullMQ. */
export const outbox = messaging.table(
  'outbox',
  {
    id: domainId('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    /** Utilisateur à l'origine de l'événement : le worker rejoue le traitement en son nom. */
    actorId: uuid('actor_id').notNull(),
    type: varchar('type', { length: 100 }).notNull(),
    payload: jsonb('payload').notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, precision: 3 }).notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true, precision: 3 }),
  },
  (table) => [
    index('outbox_unpublished_idx')
      .on(table.occurredAt)
      .where(sql`${table.publishedAt} is null`),
  ],
);

/** Un événement déjà traité par un handler est ignoré : la livraison est « au moins une fois ». */
export const processedEvents = messaging.table(
  'processed_events',
  {
    handler: varchar('handler', { length: 100 }).notNull(),
    eventId: domainId('event_id').notNull(),
    tenantId: uuid('tenant_id').notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.handler, table.eventId] }),
    index('processed_events_processed_at_idx').on(table.processedAt),
  ],
);
