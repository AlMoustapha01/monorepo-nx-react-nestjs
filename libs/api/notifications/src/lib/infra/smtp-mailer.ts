import type { OnApplicationShutdown } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { type EmailMessage, Mailer } from '../application/mailer.port';

const TIMEOUT_MS = 10_000;

/** SMTP (Mailpit en local). Principe 4 : chaque étape de la connexion a un timeout. */
export class SmtpMailer extends Mailer implements OnApplicationShutdown {
  private readonly transport: Transporter;

  constructor(smtpUrl: string, from: string) {
    super();
    this.transport = createTransport(
      {
        url: smtpUrl,
        connectionTimeout: TIMEOUT_MS,
        greetingTimeout: TIMEOUT_MS,
        socketTimeout: TIMEOUT_MS,
      },
      { from },
    );
  }

  async send({ to, subject, text, html, idempotencyKey }: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      to,
      subject,
      text,
      html,
      messageId: `<${idempotencyKey}@notifications>`,
    });
  }

  onApplicationShutdown(): void {
    this.transport.close();
  }
}
