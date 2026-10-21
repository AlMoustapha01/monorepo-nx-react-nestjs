import { existsSync } from 'node:fs';
import { pino } from 'pino';
import { validateEnv } from './env';
import { migrateAuthDatabase } from './migrations';

/** Étape de déploiement, avant le démarrage des nouvelles instances (comme celle de l'API). */
async function main() {
  if (existsSync('.env')) {
    process.loadEnvFile('.env');
  }
  const env = validateEnv(process.env);
  const logger = pino({ level: env.LOG_LEVEL });
  await migrateAuthDatabase(env, logger);
  logger.info('Auth migrations applied');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
