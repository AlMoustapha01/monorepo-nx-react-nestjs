import { ServiceUnavailableException } from '@nestjs/common';
import type { HealthCheckService } from '@nestjs/terminus';
import { ShutdownState } from '../lifecycle/graceful-shutdown';
import {
  type DatabaseHealthIndicator,
  HealthController,
  type RedisHealthIndicator,
} from './health.controller';

describe('HealthController', () => {
  const healthy = { status: 'ok' };
  let checks = 0;
  const health = {
    check: async () => {
      checks += 1;
      return healthy;
    },
  } as unknown as HealthCheckService;
  const state = new ShutdownState();
  const controller = new HealthController(
    health,
    {} as DatabaseHealthIndicator,
    {} as RedisHealthIndicator,
    state,
  );

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
