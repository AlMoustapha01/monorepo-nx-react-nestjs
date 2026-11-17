/**
 * Application des migrations (point d'entrée séparé : @nx-react-nestjs/api-core/migrations), partagée par
 * `migrate.js` (déploiement, `api:db-migrate`) et les bases jetables des tests. Sans NestJS.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { type Logger, runMigrations } from 'graphile-worker';
import { Client } from 'pg';
import { FORCE_ROW_LEVEL_SECURITY_SQL } from './lib/database/row-level-security';

/** Clé arbitraire et fixe : deux exécutions simultanées (deux déploiements) se sérialisent. */
const MIGRATION_LOCK_KEY = 7_316_221;

export interface MigrationOptions {
  connectionString: string;
  /** Dossier des migrations générées par drizzle-kit. */
  migrationsFolder: string;
  /** Logger de Graphile Worker ; par défaut le sien (console). */
  logger?: Logger;
}

/**
 * Migrations Drizzle, puis celles de la file de jobs (schéma graphile_worker, ADR 0012), puis la RLS
 * forcée sur les tables qui ont une politique (ADR 0013), sous un verrou consultatif.
 */
export async function applyMigrations({
  connectionString,
  migrationsFolder,
  logger,
}: MigrationOptions): Promise<void> {
  // Une seule connexion : le verrou consultatif est attaché à la session.
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await migrate(drizzle({ client }), { migrationsFolder });
    await runMigrations({ connectionString, ...(logger && { logger }) });
    await client.query(FORCE_ROW_LEVEL_SECURITY_SQL);
  } finally {
    await client.end();
  }
}
