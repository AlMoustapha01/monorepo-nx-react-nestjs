import { Injectable } from '@nestjs/common';
import {
  type IntegrationEvent,
  type IntegrationEventHandler,
  OnIntegrationEvent,
} from '@nx-react-nestjs/api-core';
import { OrderCancelled, OrderPlaced } from '@nx-react-nestjs/contracts';
import { ProductRepository } from './product.repository';

/**
 * Le catalogue tient ses compteurs de ventes à partir des événements de commande.
 * Il ne dépend pas du domaine commandes (qui, lui, dépend du catalogue) : seulement des contrats.
 * Le worker exécute le handler dans la même transaction que sa marque d'idempotence :
 * un événement livré deux fois n'est compté qu'une fois.
 */
@Injectable()
@OnIntegrationEvent(OrderPlaced, { name: 'catalog.record-sales' })
export class RecordSales implements IntegrationEventHandler<typeof OrderPlaced> {
  constructor(private readonly products: ProductRepository) {}

  async handle({ payload }: IntegrationEvent<typeof OrderPlaced>): Promise<void> {
    await this.products.adjustSoldCounts(
      payload.lines.map(({ productId, quantity }) => ({ productId, delta: quantity })),
    );
  }
}

@Injectable()
@OnIntegrationEvent(OrderCancelled, { name: 'catalog.revert-sales' })
export class RevertSales implements IntegrationEventHandler<typeof OrderCancelled> {
  constructor(private readonly products: ProductRepository) {}

  async handle({ payload }: IntegrationEvent<typeof OrderCancelled>): Promise<void> {
    await this.products.adjustSoldCounts(
      payload.lines.map(({ productId, quantity }) => ({ productId, delta: -quantity })),
    );
  }
}
