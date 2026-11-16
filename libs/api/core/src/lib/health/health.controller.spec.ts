import { ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckService } from '@nestjs/terminus';
import { ShutdownState } from '../lifecycle/graceful-shutdown';
import { type DatabaseHealthIndicator, HealthController } from './health.controller';

describe('HealthController', () => {
  const healthy = { status: 'ok' };
  let checks = 0;
  let checked: string[] = [];
  const health = {
    check: async (indicators: (() => Promise<string>)[]) => {
      checks += 1;
      checked = await Promise.all(indicators.map((indicator) => indicator()));
      return healthy;
    },
  } as unknown as HealthCheckService;
  const database = { check: async () => 'database' } as unknown as DatabaseHealthIndicator;
  const state = new ShutdownState();
  const controller = new HealthController(health, database, state);

  it('depends on Postgres only: Redis carries nothing but the rate limiting, which fails open', async () => {
    await controller.readiness();
    expect(checked).toEqual(['database']);
  });

  it('checks dependencies while the process serves traffic', async () => {
    await expect(controller.readiness()).resolves.toBe(healthy);
  });

  it('responds 503 as soon as shutdown begins, without checking dependencies; /health stays at 200', async () => {
    checks = 0;
    state.startDraining();

    expect(() => controller.readiness()).toThrow(ServiceUnavailableException);
    expect(checks).toBe(0);
    await expect(controller.liveness()).resolves.toBe(healthy);
  });
});
