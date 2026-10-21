import { ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckService } from '@nestjs/terminus';
import { AppConfig } from '../config/app-config';
import type { Env } from '../config/env';
import { ShutdownState } from '../lifecycle/graceful-shutdown';
import {
  type DatabaseHealthIndicator,
  HealthController,
  type RedisHealthIndicator,
} from './health.controller';

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
  const redis = { check: async () => 'redis' } as unknown as RedisHealthIndicator;
  const state = new ShutdownState();
  const controllerWith = (jobsEnabled: boolean) =>
    new HealthController(
      health,
      database,
      redis,
      state,
      new AppConfig({ JOBS_ENABLED: jobsEnabled } as Env),
    );
  const controller = controllerWith(true);

  it('ne dépend de Redis que si le process exécute les jobs', async () => {
    await controllerWith(false).readiness();
    expect(checked).toEqual(['database']);
    await controllerWith(true).readiness();
    expect(checked).toEqual(['database', 'redis']);
  });

  it('vérifie les dépendances tant que le process sert du trafic', async () => {
    await expect(controller.readiness()).resolves.toBe(healthy);
  });

  it('répond 503 dès le début de l’arrêt, sans vérifier les dépendances ; /health reste à 200', async () => {
    checks = 0;
    state.startDraining();

    expect(() => controller.readiness()).toThrow(ServiceUnavailableException);
    expect(checks).toBe(0);
    await expect(controller.liveness()).resolves.toBe(healthy);
  });
});
