import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfig } from '../config/app-config';
import { DatabaseSession, TransactionManager } from './database-session';
import { DATABASE, type Database } from './database.tokens';

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
      inject: [AppConfig],
      useFactory: (config: AppConfig) => {
        const pool = new Pool({
          connectionString: config.get('DATABASE_URL'),
          max: config.get('DATABASE_POOL_MAX'),
          // Principe 4 : aucune requête ni attente de connexion sans limite.
          connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
          statement_timeout: config.get('DATABASE_STATEMENT_TIMEOUT_MS'),
          idle_in_transaction_session_timeout: IDLE_IN_TRANSACTION_TIMEOUT_MS,
        });
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
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
