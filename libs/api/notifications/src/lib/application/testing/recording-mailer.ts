import { type EmailMessage, Mailer } from '../mailer.port';

export class RecordingMailer extends Mailer {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}
