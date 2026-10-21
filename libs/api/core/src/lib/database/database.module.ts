import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfig } from '../config/app-config';
import { DatabaseSession, TransactionManager } from './database-session';
import { DATABASE, type Database } from './database.tokens';

const PG_POOL = Symbol('PG_POOL');

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
