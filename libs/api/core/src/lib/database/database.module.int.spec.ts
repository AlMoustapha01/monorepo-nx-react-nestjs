import { Global, Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { sql } from 'drizzle-orm';
import { ClsModule } from 'nestjs-cls';
import { startTestDatabase, type TestDatabase, testEnv } from '../../testing';
import { AppConfigModule } from '../config/app-config';
import { RequestContext } from '../context/request-context';
import { DatabaseModule } from './database.module';
import { DATABASE, type Database } from './database.tokens';

/** Ce que CoreModule fournit à DatabaseModule : le contexte de la requête. */
@Global()
@Module({
  imports: [ClsModule.forRoot({ global: true })],
  providers: [RequestContext],
  exports: [RequestContext],
})
class TestContextModule {}

describe('DatabaseModule', () => {
  const originalEnv = { ...process.env };
  let database: TestDatabase;
  let app: TestingModule | undefined;

  const start = async (env: Record<string, string | undefined> = {}) => {
    Object.assign(
      process.env,
      testEnv({ databaseUrl: database.url, redisUrl: 'redis://localhost:6379' }),
    );
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    const module = await Test.createTestingModule({
      imports: [AppConfigModule, TestContextModule, DatabaseModule],
    }).compile();
    // Après un échec d'init, close() rejetterait la même erreur : le module n'est gardé qu'initialisé.
    await module.init();
    app = module;
    return module;
  };

  beforeAll(async () => {
    database = await startTestDatabase();
  }, 60_000);

  afterEach(async () => {
    await app?.close();
    app = undefined;
    process.env = { ...originalEnv };
  });

  afterAll(() => database?.stop());

  it('cancels a query that runs longer than DATABASE_STATEMENT_TIMEOUT_MS', async () => {
    const db = (await start({ DATABASE_STATEMENT_TIMEOUT_MS: '100' })).get<Database>(DATABASE);

    const error = await db.execute(sql`select pg_sleep(1)`).catch((caught: unknown) => caught);

    // 57014 : query_canceled (statement_timeout atteint).
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).cause).toMatchObject({ code: '57014' });
  });

  it('starts with a role subject to Row Level Security', async () => {
    await expect(start()).resolves.toBeDefined();
  });

  it('refuses to start in production with a role that bypasses Row Level Security', async () => {
    await expect(
      start({
        NODE_ENV: 'production',
        DATABASE_URL: database.adminUrl,
        SMTP_URL: 'smtp://localhost:1025',
        AUTH_JWT_SECRET: undefined,
        AUTH_JWKS_URL: 'https://auth.test.local/jwks',
      }),
    ).rejects.toThrow(/Row Level Security does not apply/);
  });
});
