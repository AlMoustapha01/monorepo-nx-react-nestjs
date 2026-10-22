import { Injectable, SetMetadata } from '@nestjs/common';
import { type FeatureFlag, featureFlagDefinition } from '@nx-react-nestjs/contracts';
import { AppConfig } from '../config/app-config';

/**
 * Évalue un flag pour la requête courante (tenant, utilisateur : `RequestContext`).
 * Asynchrone pour qu'un fournisseur distant (Unleash, flagd, OpenFeature…) remplace
 * l'implémentation sans changer les appelants.
 */
@Injectable()
export abstract class FeatureFlags {
  abstract isEnabled(flag: FeatureFlag): Promise<boolean>;
}

/** Valeur par défaut du catalogue, surchargée par `FEATURE_FLAGS` ; identique pour tous les tenants. */
@Injectable()
export class ConfiguredFeatureFlags extends FeatureFlags {
  private readonly overrides: Partial<Record<FeatureFlag, boolean>>;

  constructor(config: AppConfig) {
    super();
    this.overrides = config.get('FEATURE_FLAGS');
  }

  async isEnabled(flag: FeatureFlag): Promise<boolean> {
    return this.overrides[flag] ?? featureFlagDefinition(flag).default;
  }
}

export const REQUIRED_FEATURE_KEY = 'featureFlags:required';

/** Route (ou controller) absente tant que le flag est désactivé : 404, comme si elle n'existait pas. */
export const RequireFeature = (flag: FeatureFlag) => SetMetadata(REQUIRED_FEATURE_KEY, flag);
