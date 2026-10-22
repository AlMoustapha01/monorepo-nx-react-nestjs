import { randomUUID } from 'node:crypto';
import { type APIRequestContext, type Page, expect, request } from '@playwright/test';
import pg from 'pg';

import { E2E_PORTS } from './stack';

export const PASSWORD = 'e2e-password-1234';
const WEB_ORIGIN = `http://localhost:${E2E_PORTS.web}`;

function env(name: 'E2E_DATABASE_URL' | 'E2E_MAILPIT_URL' | 'E2E_AUTH_URL'): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} missing: the global setup did not run`);
  return value;
}

/** Adresse propre au test : les tests tournent en parallèle sur la même base. */
export function uniqueEmail(label: string): string {
  return `${label}-${randomUUID().slice(0, 8)}@e2e.test`;
}

interface MailpitMessage {
  ID: string;
  Subject: string;
}

/** Premier lien du dernier email reçu par `to` dont le sujet contient `subject`. */
export async function linkFromEmail(to: string, subject: string): Promise<string> {
  const mailpit = env('E2E_MAILPIT_URL');
  let link: string | undefined;
  await expect
    .poll(
      async () => {
        const search = await fetch(
          `${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`,
        );
        const { messages } = (await search.json()) as { messages: MailpitMessage[] };
        const message = messages.find((candidate) => candidate.Subject.includes(subject));
        if (!message) return undefined;
        const body = (await (await fetch(`${mailpit}/api/v1/message/${message.ID}`)).json()) as {
          Text: string;
        };
        link = /https?:\/\/\S+/.exec(body.Text)?.[0];
        return link;
      },
      { message: `email "${subject}" to ${to}`, timeout: 15_000 },
    )
    .toBeTruthy();
  return link ?? '';
}

/** Client du service d'auth, comme le navigateur : origine du front, cookies de session. */
async function authClient(): Promise<APIRequestContext> {
  return request.newContext({
    baseURL: `${env('E2E_AUTH_URL')}/api/auth/`,
    extraHTTPHeaders: { origin: WEB_ORIGIN },
  });
}

/** En base : personne ne clique le lien de confirmation d'un compte préparé par un test. */
async function markEmailVerified(email: string): Promise<void> {
  const client = new pg.Client({ connectionString: env('E2E_DATABASE_URL') });
  await client.connect();
  try {
    await client.query('update auth."user" set "emailVerified" = true where email = $1', [email]);
  } finally {
    await client.end();
  }
}

async function ok<T>(what: string, response: Awaited<ReturnType<APIRequestContext['post']>>) {
  expect(response.ok(), `${what}: ${response.status()} ${await response.text()}`).toBe(true);
  return (await response.json()) as T;
}

export interface Account {
  email: string;
  /** Contexte connecté au service d'auth. */
  auth: APIRequestContext;
}

/** Compte vérifié et connecté, sans passer par l'interface. */
export async function createAccount(label: string): Promise<Account> {
  const email = uniqueEmail(label);
  const auth = await authClient();
  await ok(
    'sign-up',
    await auth.post('sign-up/email', { data: { email, password: PASSWORD, name: label } }),
  );
  await markEmailVerified(email);
  await ok('sign-in', await auth.post('sign-in/email', { data: { email, password: PASSWORD } }));
  return { email, auth };
}

export async function createOrganization(account: Account, name: string): Promise<string> {
  const slug = `${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${randomUUID().slice(0, 6)}`;
  const organization = await ok<{ id: string }>(
    'organization',
    await account.auth.post('organization/create', { data: { name, slug } }),
  );
  return organization.id;
}

export async function invite(account: Account, organizationId: string, email: string) {
  await ok(
    'invitation',
    await account.auth.post('organization/invite-member', {
      data: { email, role: 'member', organizationId },
    }),
  );
}

export async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  await page.getByLabel('Adresse email').fill(email);
  await page.getByLabel('Mot de passe').fill(password);
  await page.getByRole('button', { name: 'Se connecter' }).click();
}
