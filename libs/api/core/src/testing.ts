/**
 * Utilitaires de test (point d'entrée séparé : @nx-react-nestjs/api-core/testing).
 * Jamais importé par du code de production.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import {
  // option:feature-flags:start
  type FeatureFlag,
  featureFlagDefinition,
  // option:feature-flags:end
  type IntegrationEventDefinition,
  type IntegrationEventPayload,
} from '@nx-react-nestjs/contracts';
import { metrics, NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { RedisContainer } from '@testcontainers/redis';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Logger as GraphileLogger } from 'graphile-worker';
import { SignJWT } from 'jose';
import { ClsService } from 'nestjs-cls';
import { Pool } from 'pg';
import { beforeAll, describe, expect, it } from 'vitest';
import { type Principal, RequestContext } from './lib/context/request-context';
import { DatabaseSession, TransactionManager } from './lib/database/database-session';
import type { Database } from './lib/database/database.tokens';
import { TenantScopedPool } from './lib/database/tenant-scoped-pool';
import { Outbox } from './lib/events/outbox';
// option:feature-flags:start
import { FeatureFlags } from './lib/feature-flags/feature-flags';
// option:feature-flags:end
import { type EmailMessage, Mailer } from './lib/mail/mailer';
import { applyMigrations } from './migrations';

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
    // Retries pris vite : les tests n'attendent pas les 2 s de sondage par défaut.
    JOBS_POLL_INTERVAL_MS: '100',
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
  /** Connexion de l'API : rôle `app`, soumis à la Row Level Security comme en production. */
  url: string;
  /** Superutilisateur, qui ignore la RLS : préparer ou inspecter des lignes de tous les tenants. */
  adminUrl: string;
  adminDb: Database;
  /** Session comme celle de l'API : rôle `app`, tenant du contexte posé dans chaque transaction. */
  session(context: RequestContext): DatabaseSession;
  /** Session superutilisateur : seul le filtre du code isole les tenants (la RLS ne s'applique pas). */
  adminSession(): DatabaseSession;
  stop(): Promise<void>;
}

/**
 * Démarre un Postgres jetable, configuré comme en dev (tools/docker/postgres-init.sql : rôle `app` sans privilège,
 * propriétaire de la base), et y applique les migrations comme `migrate.js`.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const root = findWorkspaceRoot();
  const container: StartedPostgreSqlContainer = await new PostgreSqlContainer('postgres:17-alpine')
    .withUsername('postgres')
    .withPassword('postgres')
    .withDatabase('app')
    .withCopyFilesToContainer([
      {
        source: join(root, 'tools/docker/postgres-init.sql'),
        target: '/docker-entrypoint-initdb.d/01-app-role.sql',
      },
    ])
    .start();
  const url = `postgres://app:app@${container.getHost()}:${container.getPort()}/app`;
  await applyMigrations({
    connectionString: url,
    migrationsFolder: join(root, 'apps/api/migrations'),
    logger: new GraphileLogger(() => () => undefined),
  });

  const pools: Pool[] = [];
  const track = <T extends Pool>(pool: T): T => {
    // Une connexion coupée à l'arrêt du conteneur ne doit pas faire planter le process de test.
    pool.on('error', () => undefined);
    pools.push(pool);
    return pool;
  };
  const adminUrl = container.getConnectionUri();
  const adminPool = track(new Pool({ connectionString: adminUrl }));

  return {
    url,
    adminUrl,
    adminDb: drizzle({ client: adminPool }),
    session: (context) =>
      new DatabaseSession(
        drizzle({
          client: track(
            new TenantScopedPool({ connectionString: url }, () => context.principal?.tenantId),
          ),
        }),
      ),
    adminSession: () => new DatabaseSession(drizzle({ client: adminPool })),
    async stop() {
      await Promise.all(pools.map((pool) => pool.end()));
      await container.stop();
    },
  };
}

/** Ce que `describeTenantIsolation` doit savoir d'un repository Drizzle et de son agrégat. */
export interface TenantIsolationSpec<TRepository, TEntity> {
  /** La base du fichier de test, démarrée dans son `beforeAll`. */
  database: () => TestDatabase;
  repository: (session: DatabaseSession, context: RequestContext) => TRepository;
  /** Une entité neuve, pas encore écrite, du tenant donné. */
  entity: (tenantId: string) => TEntity;
  insert: (repository: TRepository, entity: TEntity) => Promise<unknown>;
  /** Relit l'entité ; `null` si le tenant courant ne la voit pas. */
  find: (repository: TRepository, entity: TEntity) => Promise<unknown>;
  /** Chaque lecture du port : rien d'un autre tenant (`null`, liste ou page vide). */
  reads: Record<string, (repository: TRepository, entity: TEntity) => Promise<unknown>>;
  /** Chaque écriture du port : la ligne d'un autre tenant reste intacte (l'écriture peut échouer). */
  writes: Record<string, (repository: TRepository, entity: TEntity) => Promise<unknown>>;
}

/**
 * Vérifie l'isolation des tenants pour chaque lecture et chaque écriture d'un repository, avec chacune des deux
 * barrières (ADR 0013) : son filtre `tenant_id` seul (session superutilisateur, sans RLS), puis la session de
 * l'API, RLS comprise. Que la RLS couvre chaque table d'un tenant, c'est le test de api-core qui le vérifie.
 */
export function describeTenantIsolation<TRepository, TEntity>(
  name: string,
  spec: TenantIsolationSpec<TRepository, TEntity>,
): void {
  const context = createTestRequestContext();
  const barriers: [string, () => DatabaseSession][] = [
    ['with its tenant filter alone', () => spec.database().adminSession()],
    ['with Row Level Security', () => spec.database().session(context)],
  ];
  const newTenant = () => ({ userId: randomUUID(), tenantId: randomUUID() });

  describe(`${name}: tenant isolation`, () => {
    for (const [barrier, session] of barriers) {
      describe(`${barrier}`, () => {
        let repository: TRepository;
        beforeAll(() => {
          repository = spec.repository(session(), context);
        });

        /** Une entité du tenant `owner`, écrite en son nom. */
        const foreignEntity = async (owner: Principal) => {
          const entity = spec.entity(owner.tenantId);
          await context.runAs(owner, () => spec.insert(repository, entity));
          return entity;
        };

        for (const [method, read] of Object.entries(spec.reads)) {
          it(`${method} does not see a row of another tenant`, async () => {
            const foreign = await foreignEntity(newTenant());
            const result = await context.runAs(newTenant(), () => read(repository, foreign));
            expect(isEmptyResult(result), `${method} returned ${JSON.stringify(result)}`).toBe(
              true,
            );
          });
        }

        for (const [method, write] of Object.entries(spec.writes)) {
          it(`${method} leaves a row of another tenant untouched`, async () => {
            const owner = newTenant();
            const foreign = await foreignEntity(owner);
            const before = await context.runAs(owner, () => spec.find(repository, foreign));

            // Refusée ou sans effet : les deux sont acceptables, seule la ligne compte.
            await context
              .runAs(newTenant(), () => write(repository, foreign))
              .catch(() => undefined);

            expect(await context.runAs(owner, () => spec.find(repository, foreign))).toEqual(
              before,
            );
          });
        }

        it('insert writes to the context tenant, not the entity tenant', async () => {
          const [writer, other] = [newTenant(), newTenant()];
          const forged = spec.entity(other.tenantId);
          await context.runAs(writer, () => spec.insert(repository, forged));

          expect(await context.runAs(other, () => spec.find(repository, forged))).toBeNull();
          expect(await context.runAs(writer, () => spec.find(repository, forged))).not.toBeNull();
        });
      });
    }
  });
}

function isEmptyResult(result: unknown): boolean {
  if (result === null || result === undefined) return true;
  if (Array.isArray(result)) return result.length === 0;
  if (typeof result === 'object' && 'items' in result && Array.isArray(result.items)) {
    return result.items.length === 0;
  }
  return false;
}

export interface TestRedis {
  url: string;
  stop(): Promise<void>;
}

/** Démarre un Redis jetable (rate limiting). */
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

/** Garde les emails en mémoire au lieu de les envoyer, pour les vérifier dans un test. */
export class RecordingMailer extends Mailer {
  readonly sent: EmailMessage[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.sent.push(message);
  }
}

// option:feature-flags:start
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
    return this.values.get(flag) ?? featureFlagDefinition(flag).default;
  }
}
// option:feature-flags:end

/** Lecteur à la demande : `collect()` renvoie les métriques au moment de l'appel. */
class OnDemandMetricReader extends metrics.MetricReader {
  protected async onForceFlush(): Promise<void> {}
  protected async onShutdown(): Promise<void> {}
}

export interface TestTelemetry {
  spans: tracing.InMemorySpanExporter;
  /** Points de données par nom de métrique. */
  collectMetrics(): Promise<Record<string, metrics.DataPoint<unknown>[]>>;
  stop(): Promise<void>;
}

/**
 * Un vrai SDK OpenTelemetry, global, qui garde spans et métriques en mémoire. À démarrer avant de
 * créer les providers Nest : les instruments de mesure sont créés à leur construction.
 */
export function startTestTelemetry(): TestTelemetry {
  const spans = new tracing.InMemorySpanExporter();
  const reader = new OnDemandMetricReader();
  const sdk = new NodeSDK({
    spanProcessors: [new tracing.SimpleSpanProcessor(spans)],
    metricReaders: [reader],
    logRecordProcessors: [],
    instrumentations: [],
    // Détection asynchrone (hôte, process…) : elle retarderait l'export des spans.
    autoDetectResources: false,
  });
  sdk.start();
  return {
    spans,
    async collectMetrics() {
      const { resourceMetrics } = await reader.collect();
      return Object.fromEntries(
        resourceMetrics.scopeMetrics
          .flatMap((scope) => scope.metrics)
          .map((metric) => [metric.descriptor.name, metric.dataPoints]),
      );
    },
    stop: () => sdk.shutdown(),
  };
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
