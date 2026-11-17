// Lu par drizzle-kit pour générer les migrations : ce fichier n'importe que drizzle-orm.
import { sql } from 'drizzle-orm';
import { pgPolicy, pgSchema, primaryKey, timestamp, uuid } from 'drizzle-orm/pg-core';

/** Seconde barrière d'isolation (ADR 0013) : expression de référence `TENANT_ROWS_SQL`, recopiée telle quelle. */
const tenantRows = () =>
  sql`coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`;

export const accessSchema = pgSchema('access');

/**
 * Accès retirés à un utilisateur dans un tenant (retrait, départ, changement de rôle, organisation supprimée) :
 * l'API refuse tout token émis avant `revoked_at`. Écrite par le service d'identité, avant l'action (ADR 0016).
 * Une ligne par utilisateur et par tenant, mise à jour à chaque révocation : la table ne grossit pas avec le temps.
 */
export const accessRevocations = accessSchema.table(
  'revocations',
  {
    tenantId: uuid('tenant_id').notNull(),
    userId: uuid('user_id').notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, precision: 3 }).notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.userId] }),
    pgPolicy('tenant_isolation', { using: tenantRows(), withCheck: tenantRows() }),
  ],
);
