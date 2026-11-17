import { Inject, Injectable } from '@nestjs/common';
import {
  type IntegrationEvent,
  type IntegrationEventHandler,
  OnIntegrationEvent,
} from '@nx-react-nestjs/api-core';
import type {
  AuditDetails,
  AuditResource,
  IntegrationEventDefinition,
  IntegrationEventPayload,
} from '@nx-react-nestjs/contracts';
import { AuditTrail } from './audit-trail';

export interface AuditDescription {
  action: string;
  resource: AuditResource | null;
  details?: AuditDetails;
}

export interface AuditedEventHandler {
  /** Type de l'événement audité. */
  readonly audits: string;
  /** Nom stable du handler (clé d'idempotence et de job). */
  readonly handlerName: string;
  new (trail: AuditTrail): IntegrationEventHandler<IntegrationEventDefinition>;
}

/**
 * Handler qui écrit une ligne du journal pour chaque événement `definition`, au nom de son auteur et à sa date.
 * Transactionnel : la ligne et la marque d'idempotence sont écrites ensemble, un événement livré deux fois n'en
 * laisse qu'une. `describe` ne garde que des valeurs simples, sans email ni donnée personnelle.
 */
export function auditEvent<TDefinition extends IntegrationEventDefinition>(
  definition: TDefinition,
  {
    name,
    describe,
  }: {
    name: string;
    describe: (payload: IntegrationEventPayload<TDefinition>) => AuditDescription;
  },
): AuditedEventHandler {
  @Injectable()
  @OnIntegrationEvent(definition, { name })
  class AuditEventHandler implements IntegrationEventHandler<TDefinition> {
    static readonly audits = definition.type;
    static readonly handlerName = name;

    constructor(@Inject(AuditTrail) private readonly trail: AuditTrail) {}

    async handle({ actorId, occurredAt, payload }: IntegrationEvent<TDefinition>): Promise<void> {
      const { action, resource, details = {} } = describe(payload);
      await this.trail.record({
        actorId,
        action,
        resource,
        details,
        occurredAt: new Date(occurredAt),
      });
    }
  }
  return AuditEventHandler as unknown as AuditedEventHandler;
}
