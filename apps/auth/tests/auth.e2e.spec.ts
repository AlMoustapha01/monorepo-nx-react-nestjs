import { createHmac } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
// option:sentry:start
import type { ErrorEvent } from '@sentry/core';
import * as Sentry from '@sentry/node';
// option:sentry:end
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
// option:sentry:start
import { APIError } from 'better-auth/api';
// option:sentry:end
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { Client, type Pool } from 'pg';
import { pino } from 'pino';
import { type Auth, createAuth, createPool } from '../src/auth';
import { validateEnv } from '../src/env';
import type { AuthEmail } from '../src/mailer';
import { migrateAuthDatabase } from '../src/migrations';
import { createRequestListener } from '../src/server';

const APP_URL = 'http://localhost:4200';
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Code TOTP (RFC 6238, SHA-1, 6 chiffres, 30 s) d'un URI `otpauth://`, comme une application d'authentification. */
function totp(uri: string, at = Date.now()): string {
  const secret = new URL(uri).searchParams.get('secret') ?? '';
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const bits = [...secret.replace(/=+$/, '')]
    .map((char) => alphabet.indexOf(char.toUpperCase()).toString(2).padStart(5, '0'))
    .join('');
  const key = Buffer.from(bits.match(/.{8}/g)?.map((byte) => parseInt(byte, 2)) ?? []);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const hmac = createHmac('sha1', key).update(counter).digest();
  const offset = (hmac.at(-1) ?? 0) & 0xf;
  return String((hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}

/** Cookies d'une réponse ajoutés à ceux déjà envoyés, comme le navigateur. */
function withCookies(current: string, received: string): string {
  const jar = new Map(
    [current, received]
      .flatMap((cookies) => cookies.split('; '))
      .filter(Boolean)
      .map((cookie) => [cookie.split('=')[0], cookie] as const),
  );
  return [...jar.values()].join('; ');
}

/** Schémas de l'API où le service d'identité écrit. */
const API_SCHEMAS = ['audit', 'access'];

describe('Authentication service', () => {
  let container: StartedPostgreSqlContainer;
  let server: Server;
  let pool: Pool;
  let baseUrl: string;
  let auth: Auth;
  const emails: AuthEmail[] = [];
  const spans = new tracing.InMemorySpanExporter();
  const telemetry = new NodeSDK({
    spanProcessors: [new tracing.SimpleSpanProcessor(spans)],
    instrumentations: [],
    autoDetectResources: false,
  });
  // option:sentry:start
  const reported: ErrorEvent[] = [];
  // option:sentry:end

  beforeAll(async () => {
    telemetry.start();
    // option:sentry:start
    Sentry.initWithoutDefaultIntegrations({
      dsn: 'https://public@sentry.example/1',
      beforeSend: (event) => {
        reported.push(event);
        return null;
      },
    });
    // option:sentry:end
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
    await createApiTables(container.getConnectionUri());
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

    const env = validateEnv({
      NODE_ENV: 'test',
      LOG_LEVEL: 'silent',
      BETTER_AUTH_URL: baseUrl,
      BETTER_AUTH_SECRET: 'test-secret-that-is-at-least-32-characters',
      AUTH_APP_URL: APP_URL,
      CORS_ORIGINS: APP_URL,
      DATABASE_URL: container.getConnectionUri(),
      AUTH_JWT_ISSUER: ISSUER,
      AUTH_JWT_AUDIENCE: AUDIENCE,
    });
    const logger = pino({ level: 'silent' });
    // Deux fois : une migration déjà appliquée ne change rien.
    await migrateAuthDatabase(env, logger);
    await migrateAuthDatabase(env, logger);

    pool = createPool(env, logger);
    auth = createAuth({
      env,
      pool,
      sendEmail: async (email) => {
        if (email.to.startsWith('smtp-down')) {
          throw new Error('SMTP unreachable');
        }
        emails.push(email);
      },
      logger,
    });
    server.on(
      'request',
      createRequestListener({
        auth,
        pool,
        corsOrigins: [APP_URL],
        trustProxyHops: 0,
        isShuttingDown: () => false,
        logger,
      }),
    );
  });

  afterAll(async () => {
    // option:sentry:start
    await Sentry.close(0);
    // option:sentry:end
    await telemetry.shutdown();
    await new Promise((resolve) => server.close(resolve));
    await pool.end();
    await container.stop();
  });

  /** Comme le navigateur du front : origine du front, cookies de session. */
  async function call(path: string, init: { body?: unknown; cookie?: string } = {}) {
    const response = await fetch(new URL(path, baseUrl), {
      method: init.body === undefined ? 'GET' : 'POST',
      redirect: 'manual',
      headers: {
        origin: APP_URL,
        ...(init.body !== undefined && { 'content-type': 'application/json' }),
        ...(init.cookie && { cookie: init.cookie }),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });
    const cookie = response.headers
      .getSetCookie()
      .map((header) => header.split(';')[0])
      .join('; ');
    return { response, cookie, body: await response.json().catch(() => undefined) };
  }

  async function verifiedSignUp(email: string): Promise<string> {
    const signUp = await call('/api/auth/sign-up/email', {
      body: { email, password: 'correct-horse-battery', name: 'Ada' },
    });
    expect(signUp.response.status).toBe(200);
    // Email de vérification envoyé en arrière-plan.
    await vi.waitFor(() => expect(emails.find((e) => e.to === email)).toBeDefined());
    const link = /https?:\/\/\S+/.exec(emails.find((e) => e.to === email)?.text ?? '')?.[0];
    const verified = await call(new URL(link ?? '').pathname + new URL(link ?? '').search);
    expect(verified.cookie).toContain('session_token');
    return verified.cookie;
  }

  async function accessToken(cookie: string) {
    const { body } = await call('/api/auth/token', { cookie });
    const { payload } = await jwtVerify(
      (body as { token: string }).token,
      createRemoteJWKSet(new URL('/api/auth/jwks', baseUrl)),
      { issuer: ISSUER, audience: AUDIENCE, algorithms: ['EdDSA'] },
    );
    return payload;
  }

  it('issues the creator of an organization a staff token verifiable with the JWKS', async () => {
    const cookie = await verifiedSignUp('owner@shop.test');
    const organization = await call('/api/auth/organization/create', {
      body: { name: 'Boutique', slug: 'boutique' },
      cookie,
    });
    expect(organization.response.status).toBe(200);
    const tenantId = (organization.body as { id: string }).id;

    const claims = await accessToken(cookie);
    expect(claims).toMatchObject({
      tenant_id: tenantId,
      roles: ['staff'],
      email: 'owner@shop.test',
    });
    expect(claims.sub).toMatch(UUID);
    expect(tenantId).toMatch(UUID);
  });

  it('makes the first organization of the user active on sign-in', async () => {
    const signIn = await call('/api/auth/sign-in/email', {
      body: { email: 'owner@shop.test', password: 'correct-horse-battery' },
    });
    expect(signIn.response.status).toBe(200);
    expect(await accessToken(signIn.cookie)).toMatchObject({ roles: ['staff'] });
    expect(await accessToken(signIn.cookie)).toHaveProperty('tenant_id');
  });

  it('gives neither tenant nor role without an organization', async () => {
    const claims = await accessToken(await verifiedSignUp('alone@shop.test'));
    expect(claims).not.toHaveProperty('tenant_id');
    expect(claims).toMatchObject({ roles: [] });
  });

  it('refuses sign-in before the email is verified', async () => {
    await call('/api/auth/sign-up/email', {
      body: { email: 'unverified@shop.test', password: 'correct-horse-battery', name: 'Bob' },
    });
    const signIn = await call('/api/auth/sign-in/email', {
      body: { email: 'unverified@shop.test', password: 'correct-horse-battery' },
    });
    expect(signIn.response.status).toBe(403);
  });

  it('creates its tables in the auth schema, with UUIDs', async () => {
    const { rows } = await pool.query<{ table_schema: string; table_name: string }>(
      `select table_schema, table_name from information_schema.tables
       where table_schema not in ('pg_catalog', 'information_schema', ${API_SCHEMAS.map((schema) => `'${schema}'`).join(', ')}) order by table_name`,
    );
    expect(rows.every((row) => row.table_schema === 'auth')).toBe(true);
    expect(rows.map((row) => row.table_name)).toEqual(
      expect.arrayContaining(['user', 'session', 'organization', 'member', 'jwks', 'rateLimit']),
    );
    const { rows: ids } = await pool.query<{ data_type: string }>(
      `select data_type from information_schema.columns
       where table_schema = 'auth' and table_name = 'user' and column_name = 'id'`,
    );
    expect(ids[0]?.data_type).toBe('uuid');
  });

  it('traces its endpoints (Better Auth spans)', async () => {
    await call('/api/auth/sign-in/email', {
      body: { email: 'owner@shop.test', password: 'correct-horse-battery' },
    });
    const names = spans.getFinishedSpans().map((span) => span.name);
    expect(names.some((name) => name.includes('/sign-in/email'))).toBe(true);
  });

  // option:sentry:start
  it('reports an email that cannot be sent to Sentry', async () => {
    await call('/api/auth/sign-up/email', {
      body: { email: 'smtp-down@shop.test', password: 'correct-horse-battery', name: 'Eve' },
    });
    await vi.waitFor(() =>
      expect(reported).toContainEqual(
        expect.objectContaining({ tags: expect.objectContaining({ operation: 'send-email' }) }),
      ),
    );
  });

  it('sends only unexpected errors to Sentry', async () => {
    reported.length = 0;
    const onError = auth.options.onAPIError?.onError as (error: unknown) => Promise<void> | void;
    await onError(new APIError('UNAUTHORIZED', { message: 'Invalid password' }));
    expect(reported).toEqual([]);
    await onError(new Error('connection terminated'));
    expect(reported).toEqual([
      expect.objectContaining({ tags: expect.objectContaining({ operation: 'api' }) }),
    ]);
  });
  // option:sentry:end

  describe('audit log', () => {
    const entries = async (tenantId: string) =>
      (
        await pool.query<{
          actor_id: string;
          action: string;
          resource_type: string;
          resource_id: string;
          details: unknown;
          trace_id: string | null;
        }>(
          'select actor_id, action, resource_type, resource_id, details, trace_id from audit.entries where tenant_id = $1 order by occurred_at, id',
          [tenantId],
        )
      ).rows;

    it('records a sign-in and the removal of a member, by whom, without email', async () => {
      const ownerCookie = await verifiedSignUp('audit-owner@shop.test');
      const organization = await call('/api/auth/organization/create', {
        body: { name: 'Audit', slug: 'audit' },
        cookie: ownerCookie,
      });
      const tenantId = (organization.body as { id: string }).id;
      const ownerId = (await accessToken(ownerCookie)).sub;
      await verifiedSignUp('audit-member@shop.test');
      const { rows } = await pool.query<{ id: string }>('select id from "user" where email = $1', [
        'audit-member@shop.test',
      ]);
      const memberId = rows[0]?.id ?? '';
      await auth.api.addMember({
        body: { userId: memberId, role: 'admin', organizationId: tenantId },
      });

      const signIn = await call('/api/auth/sign-in/email', {
        body: { email: 'audit-owner@shop.test', password: 'correct-horse-battery' },
      });
      expect(signIn.response.status).toBe(200);
      const removed = await call('/api/auth/organization/remove-member', {
        body: { memberIdOrEmail: 'audit-member@shop.test', organizationId: tenantId },
        cookie: signIn.cookie,
      });
      expect(removed.response.status).toBe(200);

      const recorded = await entries(tenantId);
      expect(recorded).toEqual([
        expect.objectContaining({
          actor_id: ownerId,
          action: 'identity.signed-in',
          resource_id: ownerId,
        }),
        expect.objectContaining({
          actor_id: ownerId,
          action: 'identity.member-removed',
          resource_type: 'member',
          resource_id: memberId,
          details: { role: 'admin' },
        }),
      ]);
      expect(JSON.stringify(recorded)).not.toContain('@shop.test');
    });

    it('signs in even when the audit entry cannot be written', async () => {
      await pool.query('alter table audit.entries rename to entries_unavailable');
      try {
        const signIn = await call('/api/auth/sign-in/email', {
          body: { email: 'audit-owner@shop.test', password: 'correct-horse-battery' },
        });
        expect(signIn.response.status).toBe(200);
        // option:sentry:start
        await vi.waitFor(() =>
          expect(reported.some((event) => event.tags?.['operation'] === 'audit')).toBe(true),
        );
        // option:sentry:end
      } finally {
        await pool.query('alter table audit.entries_unavailable rename to entries');
      }
    });
  });

  describe('two-factor authentication', () => {
    const PASSWORD = 'correct-horse-battery';

    /** Active la 2FA d'un compte connecté : URI du TOTP, codes de secours et cookie à jour. */
    async function enableTwoFactor(cookie: string) {
      const enabled = await call('/api/auth/two-factor/enable', {
        body: { password: PASSWORD },
        cookie,
      });
      expect(enabled.response.status).toBe(200);
      const { totpURI, backupCodes } = enabled.body as { totpURI: string; backupCodes: string[] };
      const session = withCookies(cookie, enabled.cookie);
      const confirmed = await call('/api/auth/two-factor/verify-totp', {
        body: { code: totp(totpURI) },
        cookie: session,
      });
      expect(confirmed.response.status).toBe(200);
      return { totpURI, backupCodes, cookie: withCookies(session, confirmed.cookie) };
    }

    const signIns = async (tenantId: string) =>
      (
        await pool.query<{ details: { method: string } }>(
          `select details from audit.entries where tenant_id = $1 and action = 'identity.signed-in'`,
          [tenantId],
        )
      ).rows.map((row) => row.details.method);

    async function organizationOf(cookie: string, name: string): Promise<string> {
      const organization = await call('/api/auth/organization/create', {
        body: { name, slug: name },
        cookie,
      });
      return (organization.body as { id: string }).id;
    }

    it('asks for the code of the authenticator app after the password, then opens the session', async () => {
      const email = '2fa-totp@shop.test';
      const cookie = await verifiedSignUp(email);
      const tenantId = await organizationOf(cookie, '2fa-totp');
      const { totpURI } = await enableTwoFactor(cookie);

      const signIn = await call('/api/auth/sign-in/email', { body: { email, password: PASSWORD } });
      expect(signIn.response.status).toBe(200);
      expect(signIn.body).toMatchObject({ twoFactorRedirect: true });
      // Le cookie de session est effacé (valeur vide), pas ouvert.
      expect(signIn.cookie).not.toMatch(/session_token=[^;]/);
      // Pas encore connecté : le mot de passe seul n'est pas une connexion.
      expect(await signIns(tenantId)).toEqual([]);

      const wrong = await call('/api/auth/two-factor/verify-totp', {
        body: { code: '000000' },
        cookie: signIn.cookie,
      });
      expect(wrong.response.status).toBe(401);
      const verified = await call('/api/auth/two-factor/verify-totp', {
        body: { code: totp(totpURI) },
        cookie: signIn.cookie,
      });
      expect(verified.response.status).toBe(200);
      expect(verified.cookie).toMatch(/session_token=[^;]/);
      expect((await accessToken(verified.cookie))['tenant_id']).toBe(tenantId);
      expect(await signIns(tenantId)).toEqual(['two-factor/verify-totp']);
    });

    it('accepts a backup code once, instead of the authenticator app', async () => {
      const email = '2fa-backup@shop.test';
      const cookie = await verifiedSignUp(email);
      await organizationOf(cookie, '2fa-backup');
      const { backupCodes } = await enableTwoFactor(cookie);
      const code = backupCodes[0] ?? '';

      const useCode = async () => {
        const signIn = await call('/api/auth/sign-in/email', {
          body: { email, password: PASSWORD },
        });
        return call('/api/auth/two-factor/verify-backup-code', {
          body: { code },
          cookie: signIn.cookie,
        });
      };
      expect((await useCode()).response.status).toBe(200);
      expect((await useCode()).response.status).toBe(401);
    });

    it('lets an organization require 2FA: a member without it gets no access to the tenant', async () => {
      const ownerCookie = await verifiedSignUp('2fa-owner@shop.test');
      const tenantId = await organizationOf(ownerCookie, '2fa-required');
      const memberCookie = await verifiedSignUp('2fa-member@shop.test');
      const memberId = (await accessToken(memberCookie)).sub ?? '';
      await auth.api.addMember({
        body: { userId: memberId, role: 'member', organizationId: tenantId },
      });
      await call('/api/auth/organization/set-active', {
        body: { organizationId: tenantId },
        cookie: memberCookie,
      });
      const require = (cookie: string, required: boolean) =>
        call('/api/auth/organization/update', {
          body: { organizationId: tenantId, data: { requireTwoFactor: required } },
          cookie,
        });

      // Sans 2FA lui-même, l'owner se fermerait la porte : refusé.
      const refused = await require(ownerCookie, true);
      expect(refused.response.status).toBe(403);
      expect(refused.body).toMatchObject({ code: 'TWO_FACTOR_REQUIRED_FIRST' });

      const owner = await enableTwoFactor(ownerCookie);
      const before = Date.now();
      expect((await require(owner.cookie, true)).response.status).toBe(200);
      expect((await accessToken(owner.cookie))['tenant_id']).toBe(tenantId);
      // Le membre sans 2FA perd l'accès aussitôt (révocation) et ses tokens suivants n'ont plus le tenant.
      expect((await revokedAt(tenantId, memberId))?.getTime()).toBeGreaterThanOrEqual(before);
      expect(await accessToken(memberCookie)).not.toHaveProperty('tenant_id');
      const recorded = await pool.query(
        `select details from audit.entries where tenant_id = $1 and action = 'identity.two-factor-requirement-changed'`,
        [tenantId],
      );
      expect(recorded.rows).toEqual([{ details: { required: true } }]);

      const member = await enableTwoFactor(memberCookie);
      expect((await accessToken(member.cookie))['tenant_id']).toBe(tenantId);

      // Désactiver sa 2FA retire l'accès aux organisations qui l'exigent.
      const beforeDisable = Date.now();
      const disabled = await call('/api/auth/two-factor/disable', {
        body: { password: PASSWORD },
        cookie: member.cookie,
      });
      expect(disabled.response.status).toBe(200);
      const afterDisable = withCookies(member.cookie, disabled.cookie);
      expect((await revokedAt(tenantId, memberId))?.getTime()).toBeGreaterThanOrEqual(
        beforeDisable,
      );
      expect(await accessToken(afterDisable)).not.toHaveProperty('tenant_id');
    });

    it('lets nobody but a manager of the organization require 2FA, nor revoke its members', async () => {
      const ownerCookie = await verifiedSignUp('2fa-guard-owner@shop.test');
      const tenantId = await organizationOf(ownerCookie, '2fa-guard');
      const plainCookie = await verifiedSignUp('2fa-guard-plain@shop.test');
      const plainId = (await accessToken(plainCookie)).sub ?? '';
      await auth.api.addMember({
        body: { userId: plainId, role: 'member', organizationId: tenantId },
      });
      const outsider = await enableTwoFactor(await verifiedSignUp('2fa-guard-outsider@shop.test'));
      const plain = await enableTwoFactor(plainCookie);

      for (const cookie of [plain.cookie, outsider.cookie]) {
        const refused = await call('/api/auth/organization/update', {
          body: { organizationId: tenantId, data: { requireTwoFactor: true } },
          cookie,
        });
        expect(refused.response.ok).toBe(false);
      }
      // L'owner, sans 2FA, garde l'accès : aucune révocation n'a été écrite pour ce tenant.
      const { rows } = await pool.query('select 1 from access.revocations where tenant_id = $1', [
        tenantId,
      ]);
      expect(rows).toEqual([]);
    });

    it('refuses to create an organization that requires 2FA without having it', async () => {
      const cookie = await verifiedSignUp('2fa-create@shop.test');
      const created = await call('/api/auth/organization/create', {
        body: { name: '2fa-create', slug: '2fa-create', requireTwoFactor: true },
        cookie,
      });
      expect(created.response.status).toBe(403);
      expect(created.body).toMatchObject({ code: 'TWO_FACTOR_REQUIRED_FIRST' });
    });

    it('keeps the active organization when turning 2FA on', async () => {
      const cookie = await verifiedSignUp('2fa-two-orgs@shop.test');
      await organizationOf(cookie, '2fa-first');
      const second = await organizationOf(cookie, '2fa-second');
      await call('/api/auth/organization/set-active', { body: { organizationId: second }, cookie });

      const { cookie: afterSetup } = await enableTwoFactor(cookie);
      expect((await accessToken(afterSetup))['tenant_id']).toBe(second);
    });

    it('lets a session opened with a passkey into an organization that requires 2FA', async () => {
      const ownerCookie = await verifiedSignUp('2fa-passkey-owner@shop.test');
      const tenantId = await organizationOf(ownerCookie, '2fa-passkey');
      await enableTwoFactor(ownerCookie).then(({ cookie }) =>
        call('/api/auth/organization/update', {
          body: { organizationId: tenantId, data: { requireTwoFactor: true } },
          cookie,
        }),
      );
      const memberCookie = await verifiedSignUp('2fa-passkey-member@shop.test');
      const memberId = (await accessToken(memberCookie)).sub ?? '';
      await auth.api.addMember({
        body: { userId: memberId, role: 'member', organizationId: tenantId },
      });
      await call('/api/auth/organization/set-active', {
        body: { organizationId: tenantId },
        cookie: memberCookie,
      });
      expect(await accessToken(memberCookie)).not.toHaveProperty('tenant_id');

      // Ce que pose la connexion par passkey (la cérémonie WebAuthn est couverte par web-e2e).
      await pool.query('update auth.session set "passkeySignIn" = true where "userId" = $1', [
        memberId,
      ]);
      expect((await accessToken(memberCookie))['tenant_id']).toBe(tenantId);
    });

    const revokedAt = async (tenantId: string, userId: string) =>
      (
        await pool.query<{ revoked_at: Date }>(
          'select revoked_at from access.revocations where tenant_id = $1 and user_id = $2',
          [tenantId, userId],
        )
      ).rows[0]?.revoked_at;
  });

  describe('passkeys', () => {
    it('offers WebAuthn options for the domain of the front', async () => {
      const { response, body } = await call('/api/auth/passkey/generate-authenticate-options');
      expect(response.status).toBe(200);
      expect(body).toMatchObject({
        rpId: new URL(APP_URL).hostname,
        challenge: expect.any(String),
        // La seule présence ne vaut pas la 2FA : empreinte, visage ou code exigés (ADR 0018).
        userVerification: 'required',
      });
    });
  });

  describe('access revocation', () => {
    const revokedAt = async (tenantId: string, userId: string) =>
      (
        await pool.query<{ revoked_at: Date }>(
          'select revoked_at from access.revocations where tenant_id = $1 and user_id = $2',
          [tenantId, userId],
        )
      ).rows[0]?.revoked_at;

    /** Une organisation, son owner connecté, et un membre `admin` connecté lui aussi. */
    async function organizationWithMember(name: string) {
      const ownerCookie = await verifiedSignUp(`${name}-owner@shop.test`);
      const organization = await call('/api/auth/organization/create', {
        body: { name, slug: name },
        cookie: ownerCookie,
      });
      const tenantId = (organization.body as { id: string }).id;
      const memberCookie = await verifiedSignUp(`${name}-member@shop.test`);
      const memberId = (await accessToken(memberCookie)).sub ?? '';
      await auth.api.addMember({
        body: { userId: memberId, role: 'admin', organizationId: tenantId },
      });
      return {
        tenantId,
        ownerCookie,
        memberCookie,
        memberId,
        memberEmail: `${name}-member@shop.test`,
      };
    }

    it('revokes the access of a removed member, from the moment of the removal', async () => {
      const { tenantId, ownerCookie, memberId, memberEmail } =
        await organizationWithMember('revoke-remove');
      const before = Date.now();
      const removed = await call('/api/auth/organization/remove-member', {
        body: { memberIdOrEmail: memberEmail, organizationId: tenantId },
        cookie: ownerCookie,
      });
      expect(removed.response.status).toBe(200);
      expect((await revokedAt(tenantId, memberId))?.getTime()).toBeGreaterThanOrEqual(before - 1);
    });

    it('revokes the access of a member whose role changes, and of a member who leaves', async () => {
      const { tenantId, ownerCookie, memberCookie, memberId } =
        await organizationWithMember('revoke-role');
      const beforeRoleChange = Date.now();
      const changed = await call('/api/auth/organization/update-member-role', {
        body: {
          memberId: await memberRowId(tenantId, memberId),
          role: 'member',
          organizationId: tenantId,
        },
        cookie: ownerCookie,
      });
      expect(changed.response.status).toBe(200);
      const afterRoleChange = await revokedAt(tenantId, memberId);
      expect(afterRoleChange?.getTime()).toBeGreaterThanOrEqual(beforeRoleChange);

      await new Promise((resolve) => setTimeout(resolve, 5));
      const left = await call('/api/auth/organization/leave', {
        body: { organizationId: tenantId },
        cookie: memberCookie,
      });
      expect(left.response.status).toBe(200);
      expect((await revokedAt(tenantId, memberId))?.getTime()).toBeGreaterThan(
        afterRoleChange?.getTime() ?? 0,
      );
    });

    it('revokes the access of every member of a deleted organization', async () => {
      const { tenantId, ownerCookie, memberId } = await organizationWithMember('revoke-delete');
      const ownerId = (await accessToken(ownerCookie)).sub ?? '';
      const beforeDelete = Date.now();
      const deleted = await call('/api/auth/organization/delete', {
        body: { organizationId: tenantId },
        cookie: ownerCookie,
      });
      expect(deleted.response.status).toBe(200);
      expect((await revokedAt(tenantId, memberId))?.getTime()).toBeGreaterThanOrEqual(beforeDelete);
      expect((await revokedAt(tenantId, ownerId))?.getTime()).toBeGreaterThanOrEqual(beforeDelete);
    });

    it('refuses to remove a member while the revocation cannot be written', async () => {
      const { tenantId, ownerCookie, memberId, memberEmail } =
        await organizationWithMember('revoke-down');
      await pool.query('alter table access.revocations rename to revocations_unavailable');
      try {
        const removed = await call('/api/auth/organization/remove-member', {
          body: { memberIdOrEmail: memberEmail, organizationId: tenantId },
          cookie: ownerCookie,
        });
        expect(removed.response.status).toBe(503);
        expect(await memberRowId(tenantId, memberId)).toBeDefined();
      } finally {
        await pool.query('alter table access.revocations_unavailable rename to revocations');
      }
    });

    const memberRowId = async (tenantId: string, userId: string) =>
      (
        await pool.query<{ id: string }>(
          'select id from member where "organizationId" = $1 and "userId" = $2',
          [tenantId, userId],
        )
      ).rows[0]?.id;
  });

  it('answers the probes', async () => {
    expect((await call('/health')).response.status).toBe(200);
    expect((await call('/ready')).response.status).toBe(200);
  });
});

/**
 * Tables de l'API où le service d'identité écrit : journal d'audit (ADR 0015) et révocations (ADR 0016). Elles
 * appartiennent aux migrations de l'API ; seules leurs instructions sont appliquées, car un projet neuf
 * (create:project) n'a qu'une migration, avec tous les schémas.
 */
async function createApiTables(connectionString: string): Promise<void> {
  const folder = new URL('../../api/migrations/', import.meta.url);
  const statements = readdirSync(folder)
    .filter((file) => file.endsWith('.sql'))
    .sort()
    .flatMap((file) =>
      readFileSync(new URL(file, folder), 'utf8').split('--> statement-breakpoint'),
    )
    .filter((statement) => API_SCHEMAS.some((schema) => statement.includes(`"${schema}"`)));
  if (
    !API_SCHEMAS.every((schema) => statements.some((s) => s.includes(`CREATE SCHEMA "${schema}"`)))
  ) {
    throw new Error(`No API migration creates the schemas ${API_SCHEMAS.join(', ')}`);
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    for (const statement of statements) {
      await client.query(statement);
    }
  } finally {
    await client.end();
  }
}
