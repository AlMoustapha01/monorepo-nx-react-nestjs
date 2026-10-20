import { SetMetadata } from '@nestjs/common';
import type {
  IntegrationEventDefinition,
  IntegrationEventPayload,
} from '@nx-react-nestjs/contracts';

/** Enveloppe transportée de l'outbox jusqu'au handler. */
export interface IntegrationEvent<
  TDefinition extends IntegrationEventDefinition = IntegrationEventDefinition,
> {
  readonly id: string;
  readonly type: TDefinition['type'];
  readonly tenantId: string;
  readonly actorId: string;
  /** ISO 8601. */
  readonly occurredAt: string;
  readonly payload: IntegrationEventPayload<TDefinition>;
}

export interface IntegrationEventHandler<TDefinition extends IntegrationEventDefinition> {
  handle(event: IntegrationEvent<TDefinition>): Promise<void>;
}

export interface IntegrationEventHandlerOptions {
  /**
   * Nom stable et unique (`<domaine>.<action>`) : il sert de clé d'idempotence et d'ID de job.
   * Le changer fait retraiter les événements encore en file.
   */
  name: string;
  /**
   * `true` (défaut) : le handler s'exécute dans une transaction avec sa marque d'idempotence,
   * donc ses écritures en base n'ont lieu qu'une fois.
   * `false` : pour un handler qui appelle surtout un service externe (email, API). Il s'exécute
   * hors transaction pour ne pas garder une connexion ouverte pendant l'appel ; la marque est
   * posée après. Un crash entre les deux fait rejouer l'appel : prévoir une clé d'idempotence.
   */
  transactional?: boolean;
}

export const INTEGRATION_EVENT_HANDLER = Symbol('INTEGRATION_EVENT_HANDLER');

export interface IntegrationEventHandlerMetadata extends IntegrationEventHandlerOptions {
  definition: IntegrationEventDefinition;
}

/**
 * Déclare un provider comme consommateur d'un événement. Chaque handler reçoit son propre job :
 * il réessaie indépendamment des autres et son traitement est idempotent.
 */
export function OnIntegrationEvent(
  definition: IntegrationEventDefinition,
  options: IntegrationEventHandlerOptions,
): ClassDecorator {
  return SetMetadata<symbol, IntegrationEventHandlerMetadata>(INTEGRATION_EVENT_HANDLER, {
    definition,
    ...options,
  });
}
