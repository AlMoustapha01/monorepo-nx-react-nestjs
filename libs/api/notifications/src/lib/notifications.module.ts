import { Module } from '@nestjs/common';
import { AppConfig } from '@nx-react-nestjs/api-core';
import { Mailer } from './application/mailer.port';
import { SendOrderConfirmation } from './application/send-order-confirmation.handler';
import { LoggingMailer } from './infra/logging-mailer';
import { SmtpMailer } from './infra/smtp-mailer';

/** Aucun controller : ce domaine ne fait que réagir à des événements d'intégration. */
@Module({
  providers: [
    {
      provide: Mailer,
      inject: [AppConfig],
      useFactory: (config: AppConfig): Mailer => {
        const smtpUrl = config.get('SMTP_URL');
        return smtpUrl ? new SmtpMailer(smtpUrl, config.get('MAIL_FROM')) : new LoggingMailer();
      },
    },
    SendOrderConfirmation,
  ],
})
export class NotificationsModule {}
