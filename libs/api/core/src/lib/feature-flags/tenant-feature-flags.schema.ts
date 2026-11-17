// Lu par drizzle-kit pour générer les migrations : ce fichier n'importe que drizzle-orm.
import { sql } from 'drizzle-orm';
import {
  boolean,
  pgPolicy,
  pgSchema,
  primaryKey,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** Seconde barrière d'isolation (ADR 0013) : expression de référence `TENANT_ROWS_SQL`, recopiée telle quelle. */
const tenantRows = () =>
  sql`coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`;

export const featureFlagsSchema = pgSchema('feature_flags');

/**
 * Valeur d'un flag pour un tenant (pilote, exclusion), écrite par `node feature-flags.js` : l'emporte sur
 * `FEATURE_FLAGS` et sur la valeur par défaut du catalogue (ADR 0014). Une ligne d'un flag retiré du code est ignorée.
 */
export const tenantFeatureFlags = featureFlagsSchema.table(
  'tenant_overrides',
  {
    tenantId: uuid('tenant_id').notNull(),
    flag: varchar('flag', { length: 100 }).notNull(),
    enabled: boolean('enabled').notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.flag] }),
    pgPolicy('tenant_isolation', { using: tenantRows(), withCheck: tenantRows() }),
  ],
);
