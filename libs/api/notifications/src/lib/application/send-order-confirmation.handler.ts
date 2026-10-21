import { Injectable, Logger } from '@nestjs/common';
import {
  FeatureFlags,
  type IntegrationEvent,
  type IntegrationEventHandler,
  OnIntegrationEvent,
} from '@nx-react-nestjs/api-core';
import { OrderPlaced } from '@nx-react-nestjs/contracts';
import { orderConfirmationEmail } from '../domain/order-confirmation';
import { Mailer } from './mailer.port';

/** Réagit à OrderPlaced sans dépendre du domaine commandes : seul le contrat de l'événement compte. */
@Injectable()
// Hors transaction : pas de connexion Postgres gardée pendant l'appel SMTP.
@OnIntegrationEvent(OrderPlaced, {
  name: 'notifications.order-confirmation-email',
  transactional: false,
})
export class SendOrderConfirmation implements IntegrationEventHandler<typeof OrderPlaced> {
  private readonly logger = new Logger(SendOrderConfirmation.name);

  constructor(
    private readonly mailer: Mailer,
    private readonly flags: FeatureFlags,
  ) {}

  async handle({ id, payload }: IntegrationEvent<typeof OrderPlaced>): Promise<void> {
    // Coupe-circuit : l'événement est marqué traité, l'email n'est pas envoyé plus tard.
    if (!(await this.flags.isEnabled('notifications.order-confirmation-email'))) {
      this.logger.warn({ orderId: payload.orderId }, 'Confirmation emails disabled: skipped');
      return;
    }
    if (!payload.customerEmail) {
      this.logger.warn({ orderId: payload.orderId }, 'No customer email: confirmation skipped');
      return;
    }
    await this.mailer.send({
      to: payload.customerEmail,
      idempotencyKey: id,
      ...orderConfirmationEmail(payload),
    });
  }
}
