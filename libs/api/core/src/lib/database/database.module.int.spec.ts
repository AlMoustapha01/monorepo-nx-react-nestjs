import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { startTestDatabase, type TestDatabase, testEnv } from '../../testing';
import { AppConfigModule } from '../config/app-config';
import { DatabaseModule } from './database.module';
import { DATABASE, type Database } from './database.tokens';

describe('DatabaseModule', () => {
  let database: TestDatabase;
  let app: TestingModule;

  beforeAll(async () => {
    database = await startTestDatabase();
    Object.assign(process.env, {
      ...testEnv({
        databaseUrl: database.url,
        redisUrl: 'redis://localhost:6379',
      }),
      DATABASE_STATEMENT_TIMEOUT_MS: '100',
    });
    app = await Test.createTestingModule({
      imports: [AppConfigModule, DatabaseModule],
    }).compile();
  }, 60_000);

  afterAll(async () => {
    await app?.close();
    await database?.stop();
    delete process.env['DATABASE_STATEMENT_TIMEOUT_MS'];
  });

  it('annule une requête plus longue que DATABASE_STATEMENT_TIMEOUT_MS', async () => {
    const db = app.get<Database>(DATABASE);

    const error = await db.execute(sql`select pg_sleep(1)`).catch((caught: unknown) => caught);

    // 57014 : query_canceled (statement_timeout atteint).
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toMatchObject({ code: '57014' });
  });
});
