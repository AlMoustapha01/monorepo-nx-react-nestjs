import type { EmailContent } from '../domain/order-confirmation';

export interface EmailMessage extends EmailContent {
  to: string;
  /** Identifiant stable du message : un renvoi après retry garde le même Message-ID. */
  idempotencyKey: string;
}

/** Envoi d'emails ; l'adapter (SMTP, API d'un fournisseur…) vit dans infra/. */
export abstract class Mailer {
  abstract send(message: EmailMessage): Promise<void>;
}
