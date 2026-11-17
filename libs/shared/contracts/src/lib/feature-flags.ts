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
  'account.passkeys': {
    description:
      'Section Passkeys de la page Sécurité du compte (avec account.two-factor) : ajout et suppression. La connexion par passkey ne dépend pas du flag (ADR 0018).',
    default: false,
    client: true,
  },
  'account.two-factor': {
    description:
      'Page Sécurité du compte : vérification en deux étapes et son exigence par l’organisation. La connexion en deux étapes d’un compte qui l’a activée ne dépend pas du flag.',
    default: false,
    client: true,
  },
  'audit.log': {
    description:
      'Le staff consulte le journal d’audit du tenant (route et page). L’écriture ne dépend pas du flag.',
    default: false,
    client: true,
  },
  // example:start
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
  storefront: {
    description: 'Boutique client : catalogue, panier, commandes.',
    default: false,
    client: true,
  },
  // example:end
} as const satisfies Record<string, FeatureFlagDefinition>;

export type FeatureFlag = keyof typeof FEATURE_FLAGS;

/**
 * Définition d'un flag. À utiliser plutôt que `FEATURE_FLAGS[flag]` : le catalogue peut être vide
 * (projet sans flag), `FeatureFlag` vaut alors `never` et l'accès direct ne compile plus.
 */
export function featureFlagDefinition(flag: FeatureFlag): FeatureFlagDefinition {
  return FEATURE_FLAGS[flag];
}

/** Vrai si `name` est un flag du catalogue (valeur lue en base ou saisie, par exemple). */
export function isFeatureFlag(name: string): name is FeatureFlag {
  return Object.hasOwn(FEATURE_FLAGS, name);
}

export const featureFlagSchema = z.enum(
  Object.keys(FEATURE_FLAGS) as [FeatureFlag, ...FeatureFlag[]],
);

/** Flags `client: true` évalués pour l'utilisateur courant. */
export const featureFlagsResponseSchema = z.object({
  flags: z.record(z.string(), z.boolean()),
});
export type FeatureFlagsResponse = z.infer<typeof featureFlagsResponseSchema>;

/**
 * Surcharge d'un flag pour un tenant, choisie au back-office (ADR 0020) : `on`, `off`, ou `default` pour la retirer
 * (retour à `FEATURE_FLAGS`, puis à la valeur du catalogue).
 */
export const tenantFlagValueSchema = z.enum(['on', 'off', 'default']);
export type TenantFlagValue = z.infer<typeof tenantFlagValueSchema>;

export const setTenantFeatureFlagSchema = z.object({
  organizationId: z.uuid(),
  flag: featureFlagSchema,
  value: tenantFlagValueSchema,
});
export type SetTenantFeatureFlagInput = z.infer<typeof setTenantFeatureFlagSchema>;

/** Flags du catalogue pour un tenant : valeur du catalogue et surcharge du tenant (`null` : aucune). */
export const tenantFeatureFlagsSchema = z.object({
  organization: z.object({ id: z.string(), name: z.string() }),
  flags: z.array(
    z.object({
      flag: z.string(),
      description: z.string(),
      catalogDefault: z.boolean(),
      override: z.boolean().nullable(),
    }),
  ),
});
export type TenantFeatureFlags = z.infer<typeof tenantFeatureFlagsSchema>;
