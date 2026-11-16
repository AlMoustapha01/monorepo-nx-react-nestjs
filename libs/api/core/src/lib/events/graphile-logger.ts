import { Logger as GraphileLogger } from 'graphile-worker';

/** Ce que l'adaptateur appelle : le Logger de Nest (pino). */
export interface LogTarget {
  error(meta: object, message: string): void;
  warn(meta: object, message: string): void;
  log(meta: object, message: string): void;
  debug(meta: object, message: string): void;
}

interface GraphileMeta {
  job?: { id?: string; task_identifier?: string; attempts?: number; max_attempts?: number };
  error?: unknown;
  duration?: number;
}

/**
 * Ne garde de ce que Graphile joint à un log que des champs sûrs : il y met le job entier, dont
 * le payload, qui peut porter des données personnelles (l'email d'un client).
 */
function safeMeta(meta: GraphileMeta | undefined): object {
  if (!meta) {
    return {};
  }
  const { job, error, duration } = meta;
  return {
    ...(job && {
      jobId: job.id,
      task: job.task_identifier,
      attempt: job.attempts,
      maxAttempts: job.max_attempts,
    }),
    ...(error !== undefined && { err: error }),
    ...(duration !== undefined && { duration }),
  };
}

/** Les journaux de Graphile passent par le logger de Nest, sans le payload des jobs. */
export function graphileLogger(target: LogTarget): GraphileLogger {
  return new GraphileLogger(() => (level, message, meta) => {
    const safe = safeMeta(meta as GraphileMeta | undefined);
    switch (level) {
      case 'error':
        return target.error(safe, message);
      case 'warning':
        return target.warn(safe, message);
      case 'info':
        return target.log(safe, message);
      default:
        return target.debug(safe, message);
    }
  });
}
