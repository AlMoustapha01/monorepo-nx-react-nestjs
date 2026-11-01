import { FEATURE_FLAGS, type FeatureFlag, featureFlagDefinition } from './feature-flags';

describe('featureFlagDefinition', () => {
  it('returns the definition of every flag in the catalog', () => {
    for (const flag of Object.keys(FEATURE_FLAGS) as FeatureFlag[]) {
      expect(featureFlagDefinition(flag)).toBe(FEATURE_FLAGS[flag]);
    }
  });
});
