import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureFlag } from '@nx-react-nestjs/contracts';
import { StaticFeatureFlags } from '../../testing';
import { AppConfig } from '../config/app-config';
import { validateEnv } from '../config/env';
import { ConfiguredFeatureFlags, RequireFeature } from './feature-flags';
import { FeatureFlagsGuard } from './feature-flags.guard';

// Catalogue de test : le mécanisme se teste sans dépendre des flags du projet (catalogue vide possible).
vi.mock('@nx-react-nestjs/contracts', async (importOriginal) => {
  const { z } = await import('zod');
  const actual = await importOriginal<typeof import('@nx-react-nestjs/contracts')>();
  const FEATURE_FLAGS = {
    'test.on': { description: 'Activé par défaut.', default: true, client: true },
    'test.off': { description: 'Coupé par défaut.', default: false, client: false },
  };
  return {
    ...actual,
    FEATURE_FLAGS,
    featureFlagDefinition: (flag: keyof typeof FEATURE_FLAGS) => FEATURE_FLAGS[flag],
    featureFlagSchema: z.enum(['test.on', 'test.off']),
  };
});

const ON = 'test.on' as unknown as FeatureFlag;
const OFF = 'test.off' as unknown as FeatureFlag;

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
    await expect(flags.isEnabled(ON)).resolves.toBe(true);
    await expect(flags.isEnabled(OFF)).resolves.toBe(false);
  });

  it('applique les surcharges de FEATURE_FLAGS', async () => {
    const flags = new ConfiguredFeatureFlags(
      new AppConfig(env(' test.on = false , test.off=true')),
    );
    await expect(flags.isEnabled(ON)).resolves.toBe(false);
    await expect(flags.isEnabled(OFF)).resolves.toBe(true);
  });

  it('refuse de démarrer sur un flag inconnu ou une valeur invalide', () => {
    expect(() => env('test.onn=false')).toThrow(/FEATURE_FLAGS/);
    expect(() => env('test.on=peut-etre')).toThrow(/FEATURE_FLAGS/);
    expect(() => env('test.on')).toThrow(/FEATURE_FLAGS/);
  });
});

class Routes {
  @RequireFeature(ON)
  guarded(): void {}

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
    flags.set(ON, false);
    await expect(guard.canActivate(executionFor('list'))).resolves.toBe(true);
  });

  it('laisse passer une route dont le flag est activé', async () => {
    await expect(guard.canActivate(executionFor('guarded'))).resolves.toBe(true);
  });

  it('répond 404 quand le flag est désactivé', async () => {
    flags.set(ON, false);
    await expect(guard.canActivate(executionFor('guarded'))).rejects.toMatchObject({
      code: 'FEATURE_DISABLED',
      kind: 'NOT_FOUND',
      details: { flag: 'test.on' },
    });
  });
});
