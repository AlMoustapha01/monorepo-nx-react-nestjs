import type { Server } from 'node:http';
import { setTimeout as sleep } from 'node:timers/promises';
import type { Logger } from 'pino';

interface ShutdownOptions {
  server: Server;
  /** Délai entre le signal et la fermeture, `/ready` en 503 : le temps que le load balancer retire l'instance. */
  drainMs: number;
  /** Au-delà, le process sort en erreur, avant le SIGKILL de l'orchestrateur. */
  timeoutMs: number;
  /** Après la fermeture du serveur : pool Postgres, télémétrie. */
  close: () => Promise<void>;
  logger: Logger;
  exit?: (code: number) => void;
}

/**
 * Arrêt propre, comme celui de l'API : `shuttingDown` passe à vrai dès le signal (`/ready` en 503),
 * le serveur sert encore pendant `drainMs`, puis termine les requêtes en cours et ferme le reste.
 */
export function gracefulShutdown({
  server,
  drainMs,
  timeoutMs,
  close,
  logger,
  exit = (code) => process.exit(code),
}: ShutdownOptions) {
  let shuttingDown = false;

  return {
    get shuttingDown() {
      return shuttingDown;
    },

    async start(signal: NodeJS.Signals): Promise<void> {
      if (shuttingDown) {
        return;
      }
      shuttingDown = true;
      logger.info({ signal }, 'Shutting down: draining');
      const timeout = setTimeout(() => {
        logger.error('Graceful shutdown timed out');
        exit(1);
      }, timeoutMs);
      timeout.unref();

      try {
        await sleep(drainMs);
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeIdleConnections();
        });
        await close();
        clearTimeout(timeout);
        logger.info('Shutdown complete');
        exit(0);
      } catch (error) {
        clearTimeout(timeout);
        logger.error(error, 'Graceful shutdown failed');
        exit(1);
      }
    },
  };
}
