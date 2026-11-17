import { pino } from 'pino';
import { createPool } from './auth';
import { validateEnv } from './env';
import { loadEnvFiles } from './load-env';
import { runOperatorsCommand } from './operators-command';

/** Opérateurs de la plateforme (ADR 0019) : `node operators.js list|grant|revoke …`. En local : `pnpm dev:operator …`. */
async function main() {
  loadEnvFiles();
  const env = validateEnv(process.env);
  const pool = createPool({ ...env, DATABASE_POOL_MAX: 1 }, pino({ level: env.LOG_LEVEL }));
  try {
    const { ok, output } = await runOperatorsCommand(pool, process.argv.slice(2));
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
