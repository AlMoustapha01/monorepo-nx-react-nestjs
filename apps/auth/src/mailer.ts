import { createTransport } from 'nodemailer';
import type { Logger } from 'pino';

const TIMEOUT_MS = 10_000;

export interface AuthEmail {
  to: string;
  subject: string;
  text: string;
}

export type SendEmail = (email: AuthEmail) => Promise<void>;

/** SMTP (Mailpit en local) ; sans SMTP_URL, l'email est seulement journalisé. */
export function createSendEmail(
  smtpUrl: string | undefined,
  from: string,
  logger: Logger,
): SendEmail {
  if (!smtpUrl) {
    return async (email) => {
      logger.info({ email }, 'Email not sent (no SMTP_URL)');
    };
  }
  // Principe 4 : chaque étape de la connexion a un timeout.
  const transport = createTransport(
    {
      url: smtpUrl,
      connectionTimeout: TIMEOUT_MS,
      greetingTimeout: TIMEOUT_MS,
      socketTimeout: TIMEOUT_MS,
    },
    { from },
  );
  return async (email) => {
    await transport.sendMail(email);
  };
}
