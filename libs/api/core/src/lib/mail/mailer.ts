import { Logger, type OnApplicationShutdown, type Provider } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfig } from '../config/app-config';

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  html?: string;
  /**
   * Identifiant stable du message (ex. l'ID de l'événement traité) : un renvoi après retry garde
   * le même Message-ID, que le serveur ou le client mail peut dédoublonner.
   */
  idempotencyKey: string;
}

/** Envoi d'emails. Fourni par CoreModule : SMTP si `SMTP_URL` est défini, sinon journalisé. */
export abstract class Mailer {
  abstract send(message: EmailMessage): Promise<void>;
}

const TIMEOUT_MS = 10_000;

/** SMTP (Mailpit en local). Principe 4 : chaque étape de la connexion a un timeout. */
export class SmtpMailer extends Mailer implements OnApplicationShutdown {
  private readonly transport: Transporter;
  private readonly messageIdDomain: string;

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
    this.messageIdDomain = /@([^>\s]+)/.exec(from)?.[1] ?? 'localhost';
  }

  async send({ to, subject, text, html, idempotencyKey }: EmailMessage): Promise<void> {
    await this.transport.sendMail({
      to,
      subject,
      text,
      html,
      messageId: `<${idempotencyKey}@${this.messageIdDomain}>`,
    });
  }

  onApplicationShutdown(): void {
    this.transport.close();
  }
}

/** Sans SMTP_URL (dev, tests) : l'email est journalisé au lieu d'être envoyé. */
export class LoggingMailer extends Mailer {
  private readonly logger = new Logger(LoggingMailer.name);

  async send({ to, subject, idempotencyKey }: EmailMessage): Promise<void> {
    this.logger.log({ to, subject, idempotencyKey }, 'Email not sent (no SMTP_URL configured)');
  }
}

export function createMailer({
  smtpUrl,
  from,
}: {
  smtpUrl: string | undefined;
  from: string;
}): Mailer {
  return smtpUrl ? new SmtpMailer(smtpUrl, from) : new LoggingMailer();
}

export const mailerProvider: Provider = {
  provide: Mailer,
  inject: [AppConfig],
  useFactory: (config: AppConfig): Mailer =>
    createMailer({ smtpUrl: config.get('SMTP_URL'), from: config.get('MAIL_FROM') }),
};
