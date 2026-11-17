// Lu par drizzle-kit pour générer les migrations : ce fichier n'importe que drizzle-orm.
import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  jsonb,
  pgPolicy,
  pgSchema,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

/** ID métier `AUD-…`, comparé octet par octet pour un tri stable quelle que soit la locale. */
const domainId = customType<{ data: string }>({ dataType: () => 'text COLLATE "C"' });

/**
 * Le domaine audit possède son schéma. Exception (ADR 0015) : le service d'identité y écrit aussi ses actions
 * (connexions, membres), avec le même rôle Postgres ; il n'y lit rien.
 */
export const audit = pgSchema('audit');

/** Seconde barrière d'isolation (ADR 0013) : expression de référence `TENANT_ROWS_SQL`, recopiée telle quelle. */
const tenantRows = () =>
  sql`coalesce(current_setting('app.tenant_id', true), '') = '' or tenant_id = nullif(current_setting('app.tenant_id', true), '')::uuid`;

/** Une ligne par action ; aucune mise à jour ni suppression par l'application. */
export const auditEntries = audit.table(
  'entries',
  {
    id: domainId('id').primaryKey(),
    tenantId: uuid('tenant_id').notNull(),
    /** Null pour une action du système. Un UUID d'utilisateur, jamais un email. */
    actorId: uuid('actor_id'),
    /** Opérateur qui agissait pour l'acteur (impersonation, ADR 0019). */
    impersonatorId: uuid('impersonator_id'),
    action: varchar('action', { length: 100 }).notNull(),
    resourceType: varchar('resource_type', { length: 50 }),
    resourceId: varchar('resource_id', { length: 100 }),
    details: jsonb('details').$type<Record<string, string | number | boolean | null>>().notNull(),
    occurredAt: timestamp('occurred_at', { withTimezone: true, precision: 3 }).notNull(),
    traceId: varchar('trace_id', { length: 32 }),
  },
  (table) => [
    // Liste du tenant, plus récentes d'abord, et ses filtres par acteur et par action.
    index('entries_tenant_occurred_idx').on(
      table.tenantId,
      table.occurredAt.desc(),
      table.id.desc(),
    ),
    index('entries_tenant_actor_idx').on(table.tenantId, table.actorId, table.occurredAt.desc()),
    index('entries_tenant_action_idx').on(table.tenantId, table.action, table.occurredAt.desc()),
    pgPolicy('tenant_isolation', { using: tenantRows(), withCheck: tenantRows() }),
  ],
);

export type AuditEntryRow = typeof auditEntries.$inferSelect;
