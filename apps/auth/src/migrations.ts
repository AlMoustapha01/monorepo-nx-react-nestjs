import { getMigrations } from 'better-auth/db/migration';
import { Client } from 'pg';
import type { Logger } from 'pino';
import { AUTH_SCHEMA, createAuth, createPool } from './auth';
import type { AuthEnv } from './env';

/** Clé arbitraire et fixe, distincte de celle des migrations de l'API. */
const MIGRATION_LOCK_KEY = 7_316_222;

/**
 * Crée ou complète les tables de Better Auth dans le schéma `auth`. Better Auth ne fait qu'ajouter
 * tables, colonnes et index, et refuse une colonne obligatoire sans valeur par défaut sur une table
 * remplie : la migration reste rétrocompatible.
 */
export async function migrateAuthDatabase(env: AuthEnv, logger: Logger): Promise<void> {
  // Le verrou consultatif est attaché à cette connexion : deux déploiements se sérialisent.
  const lock = new Client({ connectionString: env.DATABASE_URL });
  await lock.connect();
  const pool = createPool(env, logger);
  try {
    await lock.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await lock.query(`create schema if not exists ${AUTH_SCHEMA}`);
    const auth = createAuth({ env, pool, sendEmail: async () => undefined, logger });
    const { runMigrations } = await getMigrations(auth.options);
    await runMigrations();
  } finally {
    await pool.end();
    await lock.end();
  }
}
