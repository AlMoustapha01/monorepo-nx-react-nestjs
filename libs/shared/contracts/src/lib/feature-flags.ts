import { z } from 'zod';

export interface FeatureFlagDefinition {
  readonly description: string;
  /** Valeur quand rien ne la surcharge (`FEATURE_FLAGS`). Une fonctionnalité nouvelle part à `false`. */
  readonly default: boolean;
  /** Exposé au front par `GET /feature-flags`. Les autres restent internes à l'API. */
  readonly client: boolean;
}

/**
 * Catalogue des flags : un nom absent d'ici ne compile pas. Un flag est temporaire : une fois la
 * fonctionnalité déployée partout, on supprime le flag et les branches mortes.
 */
export const FEATURE_FLAGS = {
  'orders.cancellation': {
    description: 'Un client peut annuler sa commande.',
    default: true,
    client: true,
  },
  'notifications.order-confirmation-email': {
    description: 'Coupe-circuit : envoie l’email de confirmation de commande.',
    default: true,
    client: false,
  },
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

export const featureFlagSchema = z.enum(
  Object.keys(FEATURE_FLAGS) as [FeatureFlag, ...FeatureFlag[]],
);

/** Flags `client: true` évalués pour l'utilisateur courant. */
export const featureFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
});
export type FeatureFlagsResponse = z.infer<typeof featureFlagsResponseSchema>;
