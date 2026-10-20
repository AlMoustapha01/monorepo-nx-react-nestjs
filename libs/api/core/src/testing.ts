/**
 * Utilitaires de test (point d'entrée séparé : @nx-react-nestjs/api-core/testing).
 * Jamais importé par du code de production.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { SignJWT } from 'jose';
import { ClsService } from 'nestjs-cls';
import { Pool } from 'pg';
import { type Principal, RequestContext } from './lib/context/request-context';
import type { Database } from './lib/database/database.module';

export const TEST_AUTH = {
  secret: 'test-secret-that-is-at-least-32-characters',
  issuer: 'https://auth.test.local',
  audience: 'api',
} as const;

/** Variables d'environnement valides pour démarrer l'app en test. */
export function testEnv(databaseUrl: string): Record<string, string> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: databaseUrl,
    AUTH_JWT_SECRET: TEST_AUTH.secret,
    AUTH_JWT_ISSUER: TEST_AUTH.issuer,
    AUTH_JWT_AUDIENCE: TEST_AUTH.audience,
  };
}

export function signTestToken(principal: Principal, expiresIn = '5m'): Promise<string> {
  return new SignJWT({ tenant_id: principal.tenantId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(principal.userId)
    .setIssuer(TEST_AUTH.issuer)
    .setAudience(TEST_AUTH.audience)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(TEST_AUTH.secret));
}

/** Un vrai RequestContext adossé à AsyncLocalStorage, sans démarrer Nest. */
export function createTestRequestContext(): RequestContext {
  return new RequestContext(new ClsService(new AsyncLocalStorage()));
}

export interface TestDatabase {
  url: string;
  db: Database;
  stop(): Promise<void>;
}

/** Démarre un Postgres jetable et y applique les migrations du repo. */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer(
    'postgres:17-alpine',
  ).start();
  const url = container.getConnectionUri();
  const pool = new Pool({ connectionString: url });
  const db = drizzle({ client: pool });
  await migrate(db, { migrationsFolder: join(findWorkspaceRoot(), 'apps/api/migrations') });

  return {
    url,
    db,
    async stop() {
      await pool.end();
      await container.stop();
    },
  };
}

function findWorkspaceRoot(from = process.cwd()): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'nx.json'))) return dir;
    if (dirname(dir) === dir) throw new Error('nx.json not found above ' + from);
  }
}
