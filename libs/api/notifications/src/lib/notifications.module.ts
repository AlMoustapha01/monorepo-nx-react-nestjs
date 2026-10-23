import { Module } from '@nestjs/common';
import { SendOrderConfirmation } from './application/send-order-confirmation.handler';

/** Aucun controller : ce domaine ne fait que réagir à des événements d'intégration. */
@Module({
  // Le Mailer vient de CoreModule (global).
  providers: [SendOrderConfirmation],
})
export class NotificationsModule {}
