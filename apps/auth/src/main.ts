// En premier : charge .env et active OpenTelemetry et Sentry avant tout autre module.
import { shutdownTelemetry } from './instrumentation';
import { createServer } from 'node:http';
import { pino } from 'pino';
import { createAuth, createPool } from './auth';
import { validateEnv } from './env';
import { createSendEmail } from './mailer';
import { createRequestListener } from './server';

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

  let shuttingDown = false;
  const server = createServer(
    createRequestListener({
      auth,
      pool,
      corsOrigins: env.CORS_ORIGINS,
      trustProxyHops: env.TRUST_PROXY_HOPS,
      isShuttingDown: () => shuttingDown,
    }),
  );
  server.listen(env.AUTH_PORT, () => logger.info(`Auth service on port ${env.AUTH_PORT}`));

  const shutdown = (signal: string) => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    logger.info({ signal }, 'Shutting down');
    // Au-delà, l'orchestrateur enverrait SIGKILL : on sort en erreur avant.
    setTimeout(() => process.exit(1), 25_000).unref();
    server.close(() => {
      Promise.all([pool.end(), shutdownTelemetry()]).then(
        () => process.exit(0),
        () => process.exit(1),
      );
    });
    server.closeIdleConnections();
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main();
