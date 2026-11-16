import {
  Global,
  Inject,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { AppConfig } from '../config/app-config';
import { RequestContext } from '../context/request-context';
import { DatabaseSession, TransactionManager } from './database-session';
import { DATABASE, type Database } from './database.tokens';
import { BYPASSES_RLS_SQL } from './row-level-security';
import { TenantScopedPool } from './tenant-scoped-pool';

const PG_POOL = Symbol('PG_POOL');

/** Attente maximum d'une connexion (pool plein ou Postgres injoignable) : la requête échoue au lieu de pendre. */
const CONNECTION_TIMEOUT_MS = 5_000;
/** Une transaction ouverte sans requête au-delà de ce délai est annulée : elle ne garde plus ses verrous. */
const IDLE_IN_TRANSACTION_TIMEOUT_MS = 60_000;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfig, RequestContext],
      useFactory: (config: AppConfig, context: RequestContext) => {
        // Chaque connexion prêtée porte le tenant du contexte : la RLS filtre sans le code (ADR 0013).
        const pool = new TenantScopedPool(
          {
            connectionString: config.get('DATABASE_URL'),
            max: config.get('DATABASE_POOL_MAX'),
            // Principe 4 : aucune requête ni attente de connexion sans limite.
            connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
            statement_timeout: config.get('DATABASE_STATEMENT_TIMEOUT_MS'),
            idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
          },
          () => context.principal?.tenantId,
        );
        // Une connexion inactive coupée par le serveur (redémarrage, bascule) émet `error` : sans
        // écouteur, le process plante. Le pool la remplace à la demande suivante.
        pool.on('error', (error) =>
          new Logger('DatabaseModule').warn({ err: error }, 'Idle Postgres connection lost'),
        );
        return pool;
      },
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle({ client: pool }),
    },
    DatabaseSession,
    { provide: TransactionManager, useExisting: DatabaseSession },
  ],
  exports: [DATABASE, DatabaseSession, TransactionManager],
})
export class DatabaseModule implements OnApplicationBootstrap, OnApplicationShutdown {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly config: AppConfig,
  ) {}

  /** Un superutilisateur ou un rôle BYPASSRLS ignore les politiques : refusé en production. */
  async onApplicationBootstrap(): Promise<void> {
    const logger = new Logger('DatabaseModule');
    let bypasses: boolean | undefined;
    try {
      const { rows } = await this.pool.query<{ bypasses: boolean }>(BYPASSES_RLS_SQL);
      bypasses = rows[0]?.bypasses;
    } catch (error) {
      // Postgres injoignable au démarrage : l'API démarre quand même, /ready le signale.
      logger.warn(
        { err: error },
        'Could not check the Row Level Security of the DATABASE_URL role',
      );
      return;
    }
    if (!bypasses) {
      return;
    }
    const message =
      'The DATABASE_URL role is a superuser or has BYPASSRLS: Row Level Security does not apply';
    if (this.config.get('NODE_ENV') === 'production') {
      throw new Error(message);
    }
    // Cas typique : une base locale créée avant la RLS, où `app` était le superutilisateur.
    logger.warn(`${message}. Local database: pnpm dev:down -v && pnpm dev:setup`);
  }

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
