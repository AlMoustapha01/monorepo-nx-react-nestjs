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
