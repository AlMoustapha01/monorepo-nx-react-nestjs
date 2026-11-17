import { runFeatureFlagsCommand } from '@nx-react-nestjs/api-core';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadEnvFiles } from './load-env';

/**
 * Surcharges des feature flags par tenant (ADR 0014) : `node feature-flags.js list|set|clear …`, lancé par l'équipe
 * qui exploite, comme `migrate.js`. En local : `pnpm dev:flag …`.
 */
async function main() {
  loadEnvFiles();
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is required');
  }
  const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });
  pool.on('error', (error) => console.error('Postgres connection lost', error));
  try {
    const { ok, output } = await runFeatureFlagsCommand(
      drizzle({ client: pool }),
      process.argv.slice(2),
    );
    (ok ? console.log : console.error)(output);
    process.exitCode = ok ? 0 : 1;
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
