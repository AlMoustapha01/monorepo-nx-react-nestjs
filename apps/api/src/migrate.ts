import { join } from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Client } from 'pg';
import { loadEnvFiles } from './load-env';

/** Clé arbitraire et fixe : deux exécutions simultanées (deux déploiements) se sérialisent. */
const MIGRATION_LOCK_KEY = 7_316_221;

/**
 * Applique les migrations générées, avant le démarrage des nouvelles instances (étape de
 * déploiement à part). Sans drizzle-kit : l'image de production n'a que les dépendances runtime.
 */
async function main() {
  loadEnvFiles();
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }

  // Une seule connexion : le verrou consultatif est attaché à la session.
  const client = new Client({ connectionString });
  await client.connect();
  try {
    await client.query('select pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
    await migrate(drizzle({ client }), { migrationsFolder: join(__dirname, 'migrations') });
    console.log('Migrations applied');
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
