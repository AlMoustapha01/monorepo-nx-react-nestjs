// En premier : charge .env et active OpenTelemetry et Sentry avant tout autre module.
import { shutdownTelemetry } from './instrumentation';
import { createServer } from 'node:http';
import { pino } from 'pino';
import { createAuth, createPool } from './auth';
import { validateEnv } from './env';
import { createSendEmail } from './mailer';
import { createRequestListener } from './server';
import { gracefulShutdown } from './shutdown';

/** Service d'identité : inscription, connexion, organisations (tenants), access tokens pour l'API. */
function main() {
  const env = validateEnv(process.env);
  const logger = pino({ level: env.LOG_LEVEL });
  const pool = createPool(env, logger);
  const auth = createAuth({
    env,
    pool,
    sendEmail: createSendEmail(env.SMTP_URL, env.MAIL_FROM, logger),
    logger,
  });

  const server = createServer(
    createRequestListener({
      auth,
      pool,
      corsOrigins: env.CORS_ORIGINS,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      // Appelé par requête, après la déclaration de `shutdown`.
      isShuttingDown: () => shutdown.shuttingDown,
    }),
  );
  const shutdown = gracefulShutdown({
    server,
    drainMs: env.SHUTDOWN_DRAIN_MS,
    timeoutMs: env.SHUTDOWN_TIMEOUT_MS,
    close: async () => {
      await Promise.all([pool.end(), shutdownTelemetry()]);
    },
    logger,
  });
  server.listen(env.AUTH_PORT, () => logger.info(`Auth service on port ${env.AUTH_PORT}`));

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.once(signal, () => void shutdown.start(signal));
  }
}

main();
