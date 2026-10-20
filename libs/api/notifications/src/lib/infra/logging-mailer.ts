import { Logger } from '@nestjs/common';
import { type EmailMessage, Mailer } from '../application/mailer.port';

/** Sans SMTP_URL (dev, tests) : l'email est journalisé au lieu d'être envoyé. */
export class LoggingMailer extends Mailer {
  private readonly logger = new Logger(LoggingMailer.name);

  async send({ to, subject, idempotencyKey }: EmailMessage): Promise<void> {
    this.logger.log({ to, subject, idempotencyKey }, 'Email not sent (no SMTP_URL configured)');
  }
}
