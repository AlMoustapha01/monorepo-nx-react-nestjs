import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import { Redis } from 'ioredis';
import { AppConfig } from '../../config/app-config';

/** Une requête ne doit jamais attendre Redis plus que ça. */
const COMMAND_TIMEOUT_MS = 200;
const OUTAGE_LOG_INTERVAL_MS = 60_000;
const DISCONNECTED = new Set(['reconnecting', 'close', 'end']);

/**
 * Fenêtre fixe, atomique : incrémente le compteur, pose son TTL au premier hit, puis bloque la
 * clé pour `blockDuration` quand la limite est dépassée. Toute clé expire (principe 4).
 * Renvoie hits, ms avant fin de fenêtre, bloqué (0/1), ms avant fin du blocage.
 */
const INCREMENT_SCRIPT = `
local hits = redis.call('INCR', KEYS[1])
if hits == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
local blocked = redis.call('PTTL', KEYS[2])
if blocked > 0 then return {hits, ttl, 1, blocked} end
if hits > tonumber(ARGV[2]) then
  redis.call('SET', KEYS[2], '1', 'PX', ARGV[3])
  return {hits, ttl, 1, tonumber(ARGV[3])}
end
return {hits, ttl, 0, 0}
`;

const toSeconds = (ms: number) => Math.max(0, Math.ceil(ms / 1000));

/** Compteurs partagés par toutes les instances de l'API, contrairement au stockage en mémoire. */
@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage, OnApplicationShutdown {
  private readonly logger = new Logger(RedisThrottlerStorage.name);
  private readonly redis: Redis;
  private lastOutageLog = 0;

  constructor(config: AppConfig) {
    this.redis = new Redis(config.get('REDIS_URL'), {
      // Redis injoignable : la commande échoue au plus tard après ce délai, ou dès l'échec de la
      // reconnexion, au lieu d'attendre indéfiniment dans la file hors ligne.
      commandTimeout: COMMAND_TIMEOUT_MS,
      maxRetriesPerRequest: 0,
    });
    // Sans écouteur, ioredis journalise chaque tentative de reconnexion en erreur non gérée.
    this.redis.on('error', () => undefined);
  }

  async increment(key: string, ttl: number, limit: number, blockDuration: number, name: string) {
    // Accolades : les deux clés d'un compteur restent sur le même nœud d'un Redis Cluster.
    const counter = `rate-limit:{${name}:${key}}`;
    // Connexion perdue : on n'attend pas le timeout à chaque requête. Pendant la connexion
    // initiale, la commande attend dans la file hors ligne.
    if (DISCONNECTED.has(this.redis.status)) {
      return this.failOpen(new Error(`Redis connection ${this.redis.status}`), ttl);
    }
    try {
      const [totalHits, ttlMs, blocked, blockMs] = (await this.redis.eval(
        INCREMENT_SCRIPT,
        2,
        counter,
        `${counter}:blocked`,
        ttl,
        limit,
        blockDuration,
      )) as [number, number, number, number];
      return {
        totalHits,
        timeToExpire: toSeconds(ttlMs),
        isBlocked: blocked === 1,
        timeToBlockExpire: toSeconds(blockMs),
      };
    } catch (error) {
      return this.failOpen(error, ttl);
    }
  }

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
  }

  /** Redis en panne : on laisse passer. Une panne du rate limiting ne coupe pas l'API. */
  private failOpen(error: unknown, ttl: number) {
    const now = Date.now();
    if (now - this.lastOutageLog >= OUTAGE_LOG_INTERVAL_MS) {
      this.lastOutageLog = now;
      this.logger.warn({ err: error }, 'Rate limiting disabled: Redis unavailable');
    }
    return { totalHits: 0, timeToExpire: toSeconds(ttl), isBlocked: false, timeToBlockExpire: 0 };
  }
}
