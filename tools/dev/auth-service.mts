/**
 * Comptes de démo dans le vrai service d'identité (apps/auth), quand l'API vérifie les tokens par
 * son JWKS (AUTH_JWKS_URL dans .env). Sans AUTH_JWKS_URL, les scripts signent leurs tokens avec
 * AUTH_JWT_SECRET (dev-env.mts) et ce module ne sert pas.
 */
import pg from 'pg';
import { DEV_EMAIL } from './dev-env.mts';

const PASSWORD = 'demo-password-1234';
const ORGANIZATION = { name: 'Boutique de démo', slug: 'demo' };

/** `staff` est propriétaire de l'organisation (rôle staff dans l'API), `client` simple membre. */
export const DEMO_ACCOUNTS = {
  staff: { email: 'staff@shop.local', name: 'Staff démo' },
  client: { email: DEV_EMAIL, name: 'Client démo' },
} as const;
export type DemoAccount = keyof typeof DEMO_ACCOUNTS;
export const DEMO_PASSWORD = PASSWORD;

export function usesAuthService(): boolean {
  return Boolean(process.env['AUTH_JWKS_URL']);
}

function setting(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`${name} manquant dans .env (voir .env.example).`);
    process.exit(1);
  }
  return value;
}

/** Appel au service, comme le front : son origine, et le cookie de session s'il y en a un. */
async function call(
  path: string,
  init: { body?: unknown; cookie?: string } = {},
): Promise<{ status: number; body: unknown; cookie: string }> {
  const origin = setting('AUTH_APP_URL');
  let response: Response;
  try {
    response = await fetch(new URL(`/api/auth${path}`, setting('BETTER_AUTH_URL')), {
      method: init.body === undefined ? 'GET' : 'POST',
      headers: {
        origin: new URL(origin).origin,
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
        ...(init.cookie && { cookie: init.cookie }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    console.error(
      `Service d'auth injoignable sur ${setting('BETTER_AUTH_URL')} : lancez "pnpm nx serve auth".`,
    );
    process.exit(1);
  }
  const cookie = response.headers
    .getSetCookie()
    .map((header) => header.split(';')[0])
    .join('; ');
  return { status: response.status, body: await response.json().catch(() => undefined), cookie };
}

async function expectOk(
  what: string,
  result: Promise<{ status: number; body: unknown; cookie: string }>,
) {
  const { status, body, cookie } = await result;
  if (status >= 400) {
    throw new Error(`${what}: ${status} ${JSON.stringify(body)}`);
  }
  return { body, cookie };
}

async function signIn(account: DemoAccount): Promise<string> {
  const { cookie } = await expectOk(
    `connexion de ${DEMO_ACCOUNTS[account].email}`,
    call('/sign-in/email', { body: { email: DEMO_ACCOUNTS[account].email, password: PASSWORD } }),
  );
  return cookie;
}

/**
 * Crée (ou retrouve) les deux comptes et l'organisation de démo. Idempotent. L'email est marqué
 * vérifié directement en base : en dev, personne ne clique le lien de vérification.
 */
export async function ensureDemoOrganization(): Promise<string> {
  for (const { email, name } of Object.values(DEMO_ACCOUNTS)) {
    const { status, body } = await call('/sign-up/email', {
      body: { email, password: PASSWORD, name },
    });
    // 422 : le compte existe déjà.
    if (status >= 400 && status !== 422) {
      throw new Error(`inscription de ${email}: ${status} ${JSON.stringify(body)}`);
    }
  }
  const client = new pg.Client({ connectionString: setting('DATABASE_URL') });
  await client.connect();
  try {
    await client.query('update auth."user" set "emailVerified" = true where email = any($1)', [
      Object.values(DEMO_ACCOUNTS).map((account) => account.email),
    ]);
  } finally {
    await client.end();
  }

  const staff = await signIn('staff');
  const { body: organizations } = await expectOk(
    'liste des organisations',
    call('/organization/list', { cookie: staff }),
  );
  let organization = (organizations as { id: string; slug: string }[]).find(
    (candidate) => candidate.slug === ORGANIZATION.slug,
  );
  if (!organization) {
    ({ body: organization } = (await expectOk(
      "création de l'organisation",
      call('/organization/create', { body: ORGANIZATION, cookie: staff }),
    )) as { body: { id: string; slug: string } });
  }
  const organizationId = organization.id;

  const { body: members } = await expectOk(
    'liste des membres',
    call(`/organization/list-members?organizationId=${organizationId}`, { cookie: staff }),
  );
  const isMember = (members as { members: { user: { email: string } }[] }).members.some(
    (member) => member.user.email === DEMO_ACCOUNTS.client.email,
  );
  if (!isMember) {
    // Échoue si une invitation est déjà en attente : elle est acceptée juste après.
    await call('/organization/invite-member', {
      body: { email: DEMO_ACCOUNTS.client.email, role: 'member', organizationId },
      cookie: staff,
    });
    const client = await signIn('client');
    const { body: invitations } = await expectOk(
      'invitations du client',
      call('/organization/list-user-invitations', { cookie: client }),
    );
    const pending = (
      invitations as { id: string; organizationId: string; status: string }[]
    ).filter((invitation) => invitation.organizationId === organizationId);
    for (const invitation of pending.filter((candidate) => candidate.status === 'pending')) {
      await expectOk(
        "acceptation de l'invitation",
        call('/organization/accept-invitation', {
          body: { invitationId: invitation.id },
          cookie: client,
        }),
      );
    }
  }
  return organizationId;
}

/** Access token émis par le service d'auth, comme le front l'obtient (15 min). */
export async function demoToken(account: DemoAccount): Promise<string> {
  const cookie = await signIn(account);
  const { body } = await expectOk('token', call('/token', { cookie }));
  return (body as { token: string }).token;
}
