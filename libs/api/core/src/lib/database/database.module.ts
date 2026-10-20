import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { AppConfig } from '../config/app-config';

const PG_POOL = Symbol('PG_POOL');
const DATABASE = Symbol('DATABASE');

export type Database = NodePgDatabase;

export const InjectDatabase = () => Inject(DATABASE);

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [AppConfig],
      useFactory: (config: AppConfig) =>
        new Pool({
          connectionString: config.get('DATABASE_URL'),
          max: config.get('DATABASE_POOL_MAX'),
        }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool): Database => drizzle({ client: pool }),
    },
  ],
  exports: [DATABASE],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}
