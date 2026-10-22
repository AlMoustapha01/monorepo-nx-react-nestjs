import { FEATURE_FLAGS, type FeatureFlag, featureFlagDefinition } from './feature-flags';

describe('featureFlagDefinition', () => {
  it('renvoie la définition de chaque flag du catalogue', () => {
    for (const flag of Object.keys(FEATURE_FLAGS) as FeatureFlag[]) {
      expect(featureFlagDefinition(flag)).toBe(FEATURE_FLAGS[flag]);
    }
  });
});
