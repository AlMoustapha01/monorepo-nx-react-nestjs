import type { FeatureFlag } from '@nx-react-nestjs/contracts';
import { StaticFeatureFlags } from '../../testing';
import { FeatureFlagsController } from './feature-flags.controller';

// Catalogue de test : le mécanisme se teste sans dépendre des flags du projet (catalogue vide possible).
vi.mock('@nx-react-nestjs/contracts', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@nx-react-nestjs/contracts')>();
  const FEATURE_FLAGS = {
    'test.client': { description: 'Exposé au front.', default: true, client: true },
    'test.internal': { description: 'Interne à l’API.', default: true, client: false },
  };
  return {
    ...actual,
    FEATURE_FLAGS,
    featureFlagDefinition: (flag: keyof typeof FEATURE_FLAGS) => FEATURE_FLAGS[flag],
  };
});

describe('FeatureFlagsController', () => {
  const flags = new StaticFeatureFlags();
  const controller = new FeatureFlagsController(flags);
  afterEach(() => flags.reset());

  it('expose les flags client avec leur valeur par défaut, pas les flags internes', async () => {
    await expect(controller.list()).resolves.toEqual({ flags: { 'test.client': true } });
  });

  it('expose la valeur évaluée pour la requête', async () => {
    flags.set('test.client' as unknown as FeatureFlag, false);
    await expect(controller.list()).resolves.toEqual({ flags: { 'test.client': false } });
  });
});
