import { Logger } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { createTransport } from 'nodemailer';
import { AppConfig } from '../config/app-config';
import type { Env } from '../config/env';
import { createMailer, LoggingMailer, Mailer, mailerProvider, SmtpMailer } from './mailer';

interface FakeTransport {
  sendMail: ReturnType<typeof vi.fn<(options: Record<string, unknown>) => Promise<void>>>;
  close: ReturnType<typeof vi.fn<() => void>>;
}

vi.mock('nodemailer', () => ({
  createTransport: vi.fn<() => FakeTransport>(() => ({
    sendMail: vi.fn<(options: Record<string, unknown>) => Promise<void>>(async () => undefined),
    close: vi.fn<() => void>(),
  })),
}));

const message = {
  to: 'ada@example.com',
  subject: 'Bonjour',
  text: 'Texte',
  html: '<p>Texte</p>',
  idempotencyKey: 'EVT-01jb4x7k2m9qwfzp3hd8',
};

describe('createMailer', () => {
  it('sends over SMTP when SMTP_URL is set', () => {
    expect(
      createMailer({ smtpUrl: 'smtp://localhost:1025', from: 'App <no-reply@app.test>' }),
    ).toBeInstanceOf(SmtpMailer);
  });

  it('only logs without SMTP_URL (dev, tests)', () => {
    expect(createMailer({ smtpUrl: undefined, from: 'App <no-reply@app.test>' })).toBeInstanceOf(
      LoggingMailer,
    );
  });
});

describe('SmtpMailer', () => {
  it('bounds each connection step with a timeout and sets the sender', () => {
    new SmtpMailer('smtp://localhost:1025', 'App <no-reply@app.test>');

    expect(createTransport).toHaveBeenLastCalledWith(
      {
        url: 'smtp://localhost:1025',
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 10_000,
      },
      { from: 'App <no-reply@app.test>' },
    );
  });

  it('keeps the same Message-ID from one send to the next: the idempotency key, on the sender domain', async () => {
    const mailer = new SmtpMailer('smtp://localhost:1025', 'App <no-reply@app.test>');
    const transport = vi.mocked(createTransport).mock.results.at(-1)?.value as FakeTransport;

    await mailer.send(message);
    await mailer.send(message);

    expect(transport.sendMail).toHaveBeenCalledTimes(2);
    expect(transport.sendMail).toHaveBeenNthCalledWith(1, {
      to: 'ada@example.com',
      subject: 'Bonjour',
      text: 'Texte',
      html: '<p>Texte</p>',
      messageId: '<EVT-01jb4x7k2m9qwfzp3hd8@app.test>',
    });
    expect(transport.sendMail.mock.calls[1]?.[0]).toEqual(transport.sendMail.mock.calls[0]?.[0]);
  });
});

describe('LoggingMailer', () => {
  it('logs the recipient and subject without sending anything', async () => {
    const log = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await new LoggingMailer().send(message);

    expect(log).toHaveBeenCalledWith(
      { to: 'ada@example.com', subject: 'Bonjour', idempotencyKey: 'EVT-01jb4x7k2m9qwfzp3hd8' },
      'Email not sent (no SMTP_URL configured)',
    );
  });
});

describe('mailerProvider', () => {
  it('provides the Mailer chosen from SMTP_URL and MAIL_FROM', async () => {
    const config = new AppConfig({
      SMTP_URL: 'smtp://localhost:1025',
      MAIL_FROM: 'App <a@app.test>',
    } as Env);
    const moduleRef = await Test.createTestingModule({
      providers: [{ provide: AppConfig, useValue: config }, mailerProvider],
    }).compile();

    expect(moduleRef.get(Mailer)).toBeInstanceOf(SmtpMailer);
  });
});
