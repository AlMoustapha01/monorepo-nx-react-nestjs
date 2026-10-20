import { Controller, Get, Injectable, VERSION_NEUTRAL } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { SkipThrottle } from '@nestjs/throttler';
import { sql } from 'drizzle-orm';
import { Public } from '../auth/public.decorator';
import { type Database, InjectDatabase } from '../database/database.module';

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

/** /health = le process répond (liveness) ; /ready = il peut servir du trafic (readiness). */
@Public()
@SkipThrottle()
@Controller({ version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  @Get('health')
  @HealthCheck()
  liveness() {
    return this.health.check([]);
  }

  @Get('ready')
  @HealthCheck()
  readiness() {
    return this.health.check([() => this.database.check('database')]);
  }
}
