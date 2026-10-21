import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import type { Pool } from 'pg';
import { pino } from 'pino';
import { createAuth, createPool } from '../src/auth';
import { validateEnv } from '../src/env';
import type { AuthEmail } from '../src/mailer';
import { migrateAuthDatabase } from '../src/migrations';
import { createRequestListener } from '../src/server';

const APP_URL = 'http://localhost:4200';
const ISSUER = 'https://auth.test.local';
const AUDIENCE = 'api';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('Service d’authentification', () => {
  let container: StartedPostgreSqlContainer;
  let server: Server;
  let pool: Pool;
  let baseUrl: string;
  const emails: AuthEmail[] = [];

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:17-alpine').start();
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
    const auth = createAuth({
      env,
      pool,
      sendEmail: async (email) => void emails.push(email),
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
      }),
    );
  });

  afterAll(async () => {
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

  it('délivre au créateur d’une organisation un token staff vérifiable par le JWKS', async () => {
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

  it('ouvre la première organisation de l’utilisateur à la connexion', async () => {
    const signIn = await call('/api/auth/sign-in/email', {
      body: { email: 'owner@shop.test', password: 'correct-horse-battery' },
    });
    expect(signIn.response.status).toBe(200);
    expect(await accessToken(signIn.cookie)).toMatchObject({ roles: ['staff'] });
    expect(await accessToken(signIn.cookie)).toHaveProperty('tenant_id');
  });

  it('ne donne ni tenant ni rôle sans organisation', async () => {
    const claims = await accessToken(await verifiedSignUp('alone@shop.test'));
    expect(claims).not.toHaveProperty('tenant_id');
    expect(claims).toMatchObject({ roles: [] });
  });

  it('refuse la connexion avant la vérification de l’email', async () => {
    await call('/api/auth/sign-up/email', {
      body: { email: 'unverified@shop.test', password: 'correct-horse-battery', name: 'Bob' },
    });
    const signIn = await call('/api/auth/sign-in/email', {
      body: { email: 'unverified@shop.test', password: 'correct-horse-battery' },
    });
    expect(signIn.response.status).toBe(403);
  });

  it('crée ses tables dans le schéma auth, avec des UUID', async () => {
    const { rows } = await pool.query<{ table_schema: string; table_name: string }>(
      `select table_schema, table_name from information_schema.tables
       where table_schema not in ('pg_catalog', 'information_schema') order by table_name`,
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

  it('répond aux sondes', async () => {
    expect((await call('/health')).response.status).toBe(200);
    expect((await call('/ready')).response.status).toBe(200);
  });
});
