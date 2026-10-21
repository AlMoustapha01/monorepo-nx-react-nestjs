import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaticFeatureFlags } from '../../testing';
import { AppConfig } from '../config/app-config';
import { validateEnv } from '../config/env';
import { ConfiguredFeatureFlags, RequireFeature } from './feature-flags';
import { FeatureFlagsGuard } from './feature-flags.guard';

const env = (FEATURE_FLAGS?: string) =>
  validateEnv({
    DATABASE_URL: 'postgres://app:app@localhost:5432/app',
    REDIS_URL: 'redis://localhost:6379',
    AUTH_JWT_SECRET: 'x'.repeat(32),
    AUTH_JWT_ISSUER: 'issuer',
    AUTH_JWT_AUDIENCE: 'api',
    FEATURE_FLAGS,
  });

describe('ConfiguredFeatureFlags', () => {
  it('prend la valeur par défaut du catalogue sans surcharge', async () => {
    const flags = new ConfiguredFeatureFlags(new AppConfig(env()));
    await expect(flags.isEnabled('orders.cancellation')).resolves.toBe(true);
  });

  it('applique les surcharges de FEATURE_FLAGS', async () => {
    const flags = new ConfiguredFeatureFlags(
      new AppConfig(
        env(' orders.cancellation = false , notifications.order-confirmation-email=true'),
      ),
    );
    await expect(flags.isEnabled('orders.cancellation')).resolves.toBe(false);
    await expect(flags.isEnabled('notifications.order-confirmation-email')).resolves.toBe(true);
  });

  it('refuse de démarrer sur un flag inconnu ou une valeur invalide', () => {
    expect(() => env('orders.cancelation=false')).toThrow(/FEATURE_FLAGS/);
    expect(() => env('orders.cancellation=peut-etre')).toThrow(/FEATURE_FLAGS/);
    expect(() => env('orders.cancellation')).toThrow(/FEATURE_FLAGS/);
  });
});

class Routes {
  @RequireFeature('orders.cancellation')
  cancel(): void {}

  list(): void {}
}

const executionFor = (handler: keyof Routes): ExecutionContext =>
  ({
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
  }) as unknown as ExecutionContext;

describe('FeatureFlagsGuard', () => {
  const flags = new StaticFeatureFlags();
  const guard = new FeatureFlagsGuard(new Reflector(), flags);
  afterEach(() => flags.reset());

  it('laisse passer une route sans flag', async () => {
    flags.set('orders.cancellation', false);
    await expect(guard.canActivate(executionFor('list'))).resolves.toBe(true);
  });

  it('laisse passer une route dont le flag est activé', async () => {
    await expect(guard.canActivate(executionFor('cancel'))).resolves.toBe(true);
  });

  it('répond 404 quand le flag est désactivé', async () => {
    flags.set('orders.cancellation', false);
    await expect(guard.canActivate(executionFor('cancel'))).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
      kind: 'NOT_FOUND',
      details: { flag: 'orders.cancellation' },
    });
  });
});
