import type { z } from 'zod';

/**
 * Événement d'intégration : un fait publié par un domaine, que d'autres domaines consomment
 * de façon asynchrone (outbox → BullMQ). Le schéma est le contrat : il est validé à la
 * publication et à la consommation.
 */
export interface IntegrationEventDefinition<
  TType extends string = string,
  TSchema extends z.ZodType = z.ZodType,
> {
  readonly type: TType;
  readonly schema: TSchema;
}

export type IntegrationEventPayload<TDefinition extends IntegrationEventDefinition> = z.infer<
  TDefinition['schema']
>;

/** `<domaine>.<fait-au-passé>.v<version>` : une version ne change jamais, on en crée une nouvelle. */
const EVENT_TYPE_PATTERN = /^[a-z]+\.[a-z]+(-[a-z]+)*\.v[1-9]\d*$/;

/** Appelée à la déclaration, donc au démarrage : un type mal formé est un bug de code. */
export function defineIntegrationEvent<TType extends string, TSchema extends z.ZodType>(
  type: TType,
  schema: TSchema,
): IntegrationEventDefinition<TType, TSchema> {
  if (!EVENT_TYPE_PATTERN.test(type)) {
    throw new Error(`Invalid integration event type "${type}": expected <domain>.<fact>.v<n>`);
  }
  return { type, schema };
}
