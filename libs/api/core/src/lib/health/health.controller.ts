import {
  Controller,
  Get,
  Injectable,
  ServiceUnavailableException,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/public.decorator';
import { ShutdownState } from '../lifecycle/graceful-shutdown';
import { type Database, InjectDatabase } from '../database/database.tokens';
import type { Queue } from 'bullmq';
import {
  InjectIntegrationEventsQueue,
  type IntegrationEventJob,
} from '../events/integration-event.queue';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @InjectDatabase() private readonly db: Database,
  ) {}

  async check(key: string) {
    const session = this.indicator.check(key);
    try {
      await this.db.execute(sql`select 1`);
      return session.up();
    } catch {
      return session.down();
    }
  }
}

const REDIS_CHECK_TIMEOUT_MS = 1000;

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly indicator: HealthIndicatorService,
    @InjectIntegrationEventsQueue() private readonly queue: Queue<IntegrationEventJob>,
  ) {}

  async check(key: string) {
    const session = this.indicator.check(key);
    try {
      // Sans timeout, ioredis met la commande en attente tant que Redis est injoignable.
      await Promise.race([
        this.queue.getWorkersCount(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('timeout')), REDIS_CHECK_TIMEOUT_MS).unref(),
        ),
      ]);
      return session.up();
    } catch {
      return session.down();
    }
  }
}

/** /health = le process répond (liveness) ; /ready = il peut servir du trafic (readiness). */
@Public()
@SkipThrottle()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
    private readonly redis: RedisHealthIndicator,
    private readonly shutdown: ShutdownState,
  ) {}

  @Get('health')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    if (this.shutdown.draining) {
      // Arrêt en cours : sortir du load balancer, sans lancer les checks (ni les journaliser).
      throw new ServiceUnavailableException('Shutting down');
    }
    return this.health.check([
      () => this.database.check('database'),
      () => this.redis.check('redis'),
    ]);
  }
}
