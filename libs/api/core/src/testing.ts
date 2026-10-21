/**
 * Utilitaires de test (point d'entrée séparé : @nx-react-nestjs/api-core/testing).
 * Jamais importé par du code de production.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  FEATURE_FLAGS,
  type FeatureFlag,
  type IntegrationEventDefinition,
  type IntegrationEventPayload,
} from '@nx-react-nestjs/contracts';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { SignJWT } from 'jose';
import { ClsService } from 'nestjs-cls';
import { Pool } from 'pg';
import { type Principal, RequestContext } from './lib/context/request-context';
import { TransactionManager } from './lib/database/database-session';
import type { Database } from './lib/database/database.tokens';
import { Outbox } from './lib/events/outbox';
import { FeatureFlags } from './lib/feature-flags/feature-flags';

export const TEST_AUTH = {
  secret: 'test-secret-that-is-at-least-32-characters',
  issuer: 'https://auth.test.local',
  audience: 'api',
} as const;

/** Variables d'environnement valides pour démarrer l'app en test. */
export function testEnv(urls: { databaseUrl: string; redisUrl: string }): Record<string, string> {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: urls.databaseUrl,
    REDIS_URL: urls.redisUrl,
    // Relais rapide pour que les tests n'attendent pas la seconde par défaut.
    OUTBOX_POLL_INTERVAL_MS: '50',
    AUTH_JWT_SECRET: TEST_AUTH.secret,
    AUTH_JWT_ISSUER: TEST_AUTH.issuer,
    AUTH_JWT_AUDIENCE: TEST_AUTH.audience,
  };
}

export function signTestToken(principal: Principal, expiresIn = '5m'): Promise<string> {
  return new SignJWT({
    tenant_id: principal.tenantId,
    email: principal.email,
    roles: principal.roles,
  })
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

export interface TestRedis {
  url: string;
  stop(): Promise<void>;
}

/** Démarre un Redis jetable (BullMQ). */
export async function startTestRedis(): Promise<TestRedis> {
  const container = await new RedisContainer('redis:7-alpine').start();
  return {
    url: container.getConnectionUrl(),
    stop: async () => {
      await container.stop();
    },
  };
}

/** Exécute directement : pour tester un cas d'usage avec des repositories en mémoire. */
export class InlineTransactionManager extends TransactionManager {
  transaction<T>(fn: () => Promise<T>): Promise<T> {
    return fn();
  }
}

/** Garde les événements publiés en mémoire, pour les vérifier dans un test. */
export class RecordingOutbox extends Outbox {
  readonly published: { type: string; payload: unknown }[] = [];

  async publish<TDefinition extends IntegrationEventDefinition>(
    definition: TDefinition,
    payload: IntegrationEventPayload<TDefinition>,
  ): Promise<void> {
    this.published.push({ type: definition.type, payload: definition.schema.parse(payload) });
  }

  ofType<TDefinition extends IntegrationEventDefinition>(
    definition: TDefinition,
  ): IntegrationEventPayload<TDefinition>[] {
    return this.published
      .filter((event) => event.type === definition.type)
      .map((event) => event.payload as IntegrationEventPayload<TDefinition>);
  }
}

/** Valeurs par défaut du catalogue, modifiables par test (`overrideProvider(FeatureFlags)` en e2e). */
export class StaticFeatureFlags extends FeatureFlags {
  private readonly values = new Map<FeatureFlag, boolean>();

  set(flag: FeatureFlag, enabled: boolean): this {
    this.values.set(flag, enabled);
    return this;
  }

  reset(): void {
    this.values.clear();
  }

  async isEnabled(flag: FeatureFlag): Promise<boolean> {
    return this.values.get(flag) ?? FEATURE_FLAGS[flag].default;
  }
}

/** Attend qu'une condition asynchrone devienne vraie (traitement par un worker, par exemple). */
export async function eventually(
  assertion: () => Promise<void> | void,
  timeoutMs = 10_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await assertion();
      return;
    } catch (error) {
      if (Date.now() > deadline) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
}

function findWorkspaceRoot(from = process.cwd()): string {
  for (let dir = from; ; dir = dirname(dir)) {
    if (existsSync(join(dir, 'nx.json'))) return dir;
    if (dirname(dir) === dir) throw new Error('nx.json not found above ' + from);
  }
}
