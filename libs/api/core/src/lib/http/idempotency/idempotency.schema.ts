// Lu par drizzle-kit pour générer les migrations : ce fichier n'importe que drizzle-orm.
import {
  char,
  index,
  jsonb,
  pgSchema,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const idempotency = pgSchema('idempotency');

/**
 * Une ligne par clé envoyée dans `Idempotency-Key`, propre au tenant et à l'utilisateur.
 * Écrite dans la même transaction que l'effet de la requête : l'une n'existe jamais sans l'autre.
 */
export const idempotencyKeys = idempotency.table(
  'keys',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    key: varchar('key', { length: 255 }).notNull(),
    /** SHA-256 de la méthode, du chemin et du corps : détecte une clé réutilisée pour autre chose. */
    fingerprint: char('fingerprint', { length: 64 }).notNull(),
    /** Corps renvoyé par le controller, rejoué tel quel. */
    response: jsonb('response'),
    createdAt: timestamp('created_at', { withTimezone: true, precision: 3 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId, table.key] }),
    index('keys_expires_at_idx').on(table.expiresAt),
  ],
);
