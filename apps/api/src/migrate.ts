import { join } from 'node:path';
import { applyMigrations } from '@nx-react-nestjs/api-core/migrations';
import { loadEnvFiles } from './load-env';

/**
 * Applique les migrations générées, celles de la file de jobs et la RLS forcée, avant le démarrage des nouvelles
 * instances (étape de déploiement à part). Sans drizzle-kit : l'image de production n'a que les dépendances runtime.
 */
async function main() {
  loadEnvFiles();
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  await applyMigrations({ connectionString, migrationsFolder: join(__dirname, 'migrations') });
  console.log('Migrations applied');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
