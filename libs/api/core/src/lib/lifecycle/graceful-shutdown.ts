import { setTimeout as sleep } from 'node:timers/promises';
import { type INestApplicationContext, Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../config/app-config';

/** Passe à `draining` dès le signal d'arrêt : `/ready` répond 503 pour que le load balancer retire l'instance. */
@Injectable()
export class ShutdownState {
  private drainingSince?: Date;

  get draining(): boolean {
    return this.drainingSince !== undefined;
  }

  startDraining(): void {
    this.drainingSince ??= new Date();
  }
}

/**
 * Arrêt propre sur SIGTERM/SIGINT : `/ready` en 503, attente de `SHUTDOWN_DRAIN_MS` (le temps que le
 * load balancer le voie), puis fermeture : requêtes HTTP en cours, relais, jobs, Redis, Postgres.
 * Au-delà de `SHUTDOWN_TIMEOUT_MS`, le process sort en erreur plutôt que de rester bloqué.
 */
export function closeOnSignal(app: INestApplicationContext): void {
  const config = app.get(AppConfig);
  const state = app.get(ShutdownState);
  const logger = new Logger('Shutdown');

  const shutdown = async (signal: NodeJS.Signals) => {
    if (state.draining) {
      return;
    }
    state.startDraining();
    logger.log(`${signal} received: draining`);
    setTimeout(() => {
      logger.error('Graceful shutdown timed out');
      process.exit(1);
    }, config.get('SHUTDOWN_TIMEOUT_MS')).unref();

    try {
      await sleep(config.get('SHUTDOWN_DRAIN_MS'));
      await app.close();
      logger.log('Shutdown complete');
      process.exit(0);
    } catch (error) {
      logger.error(error, 'Graceful shutdown failed');
      process.exit(1);
    }
  };

  for (const signal of ['SIGTERM', 'SIGINT'] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}
