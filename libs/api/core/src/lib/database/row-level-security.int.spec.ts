import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { createTestRequestContext, startTestDatabase, type TestDatabase } from '../../testing';
import { DatabaseSession } from './database-session';
import {
  BYPASSES_RLS_SQL,
  FORCE_ROW_LEVEL_SECURITY_SQL,
  TENANT_POLICY,
  TENANT_ROWS_SQL,
} from './row-level-security';
import { TenantScopedPool } from './tenant-scoped-pool';

/** Tables d'infrastructure parcourues pour tous les tenants par le worker (purge, rattrapage) : sans RLS. */
const INFRASTRUCTURE_SCHEMAS = ['messaging', 'idempotency'];

type PolicyRow = {
  table: string;
  enabled: boolean;
  forced: boolean;
  using: string | null;
  check: string | null;
};

describe('Row Level Security', () => {
  const context = createTestRequestContext();
  const tenantA = { userId: randomUUID(), tenantId: randomUUID() };
  const tenantB = { userId: randomUUID(), tenantId: randomUUID() };
  let database: TestDatabase;
  let session: DatabaseSession;
  const pools: Pool[] = [];

  /** Une table jetable, créée par le rôle de l'API comme le font les migrations, avec la politique de référence. */
  beforeAll(async () => {
    database = await startTestDatabase();
    const owner = new Pool({ connectionString: database.url });
    pools.push(owner);
    await owner.query(`
      create schema rls_probe;
      create table rls_probe.items (tenant_id uuid not null, label text not null);
      alter table rls_probe.items enable row level security;
      create policy ${TENANT_POLICY} on rls_probe.items using (${TENANT_ROWS_SQL}) with check (${TENANT_ROWS_SQL});
    `);
    await owner.query(FORCE_ROW_LEVEL_SECURITY_SQL);
    session = database.session(context);
  });

  afterAll(async () => {
    await Promise.all(pools.map((pool) => pool.end()));
    await database?.stop();
  });

  const labels = async (db = session.db) => {
    const { rows } = await db.execute<{ label: string }>(
      sql`select label from rls_probe.items order by label`,
    );
    return rows.map((row) => row.label);
  };
  // Une requête Drizzle ne s'exécute qu'à son `await` : attendue ici, elle part dans le contexte de l'appelant.
  const insert = async (tenantId: string, label: string, db = session.db) => {
    await db.execute(sql`insert into rls_probe.items values (${tenantId}, ${label})`);
  };

  const policies = async (): Promise<PolicyRow[]> => {
    const { rows } = await database.adminDb.execute<PolicyRow>(sql`
      select n.nspname || '.' || c.relname as table, c.relrowsecurity as enabled,
             c.relforcerowsecurity as forced, p.qual as using, p.with_check as check
      from pg_attribute a
      join pg_class c on c.oid = a.attrelid and c.relkind in ('r', 'p')
      join pg_namespace n on n.oid = c.relnamespace
      left join pg_policies p
        on p.schemaname = n.nspname and p.tablename = c.relname and p.policyname = ${TENANT_POLICY}
      where a.attname = 'tenant_id' and not a.attisdropped
        and n.nspname <> all (${`{${INFRASTRUCTURE_SCHEMAS.join(',')}}`}::text[])
      order by 1
    `);
    return rows;
  };

  it('protects every table with a tenant_id column with the tenant_isolation policy, enabled and forced', async () => {
    const rows = await policies();
    const reference = rows.find((row) => row.table === 'rls_probe.items');
    expect(reference?.using).toBeTruthy();

    // Même expression que la référence, une fois normalisée par Postgres : une copie modifiée ne passe pas.
    expect(rows).toEqual(
      rows.map((row) => ({
        table: row.table,
        enabled: true,
        forced: true,
        using: reference?.using,
        check: reference?.using,
      })),
    );
  });

  it('connects the API with a role that neither is a superuser nor bypasses Row Level Security', async () => {
    const pool = new Pool({ connectionString: database.url });
    pools.push(pool);
    const { rows } = await pool.query<{ bypasses: boolean }>(BYPASSES_RLS_SQL);
    expect(rows[0]?.bypasses).toBe(false);
  });

  it('shows only the rows of the context tenant, outside and inside a transaction', async () => {
    await context.runAs(tenantA, () => insert(tenantA.tenantId, 'a-1'));
    await context.runAs(tenantB, () => insert(tenantB.tenantId, 'b-1'));

    // Aucun filtre dans la requête : seule la politique isole.
    expect(await context.runAs(tenantA, () => labels())).toEqual(['a-1']);
    expect(await context.runAs(tenantB, () => session.transaction(() => labels()))).toEqual([
      'b-1',
    ]);
  });

  it('refuses to write a row for another tenant', async () => {
    const error = await context
      .runAs(tenantA, () => insert(tenantB.tenantId, 'forged'))
      .catch((caught: unknown) => caught);
    // 42501 : insufficient_privilege (new row violates row-level security policy).
    expect((error as Error).cause).toMatchObject({ code: '42501' });
  });

  it('shows nothing and accepts nothing on an API connection without a tenant', async () => {
    await context.runAs(tenantA, () => insert(tenantA.tenantId, 'a-hidden'));

    expect(await labels()).toEqual([]);
    const error = await insert(tenantA.tenantId, 'no-tenant').catch((caught: unknown) => caught);
    expect((error as Error).cause).toMatchObject({ code: '42501' });
  });

  it('gives a connection that waited for a free one the tenant of the waiting request', async () => {
    const pool = new TenantScopedPool(
      { connectionString: database.url, max: 1 },
      () => context.principal?.tenantId,
    );
    pools.push(pool);
    const single = new DatabaseSession(drizzle({ client: pool }));
    await context.runAs(tenantB, () => insert(tenantB.tenantId, 'b-waiting', single.db));

    let release!: () => void;
    let acquired!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    const isHeld = new Promise<void>((resolve) => (acquired = resolve));
    // A garde la seule connexion ; B attend qu'elle soit libérée par une requête de A.
    const holding = context.runAs(tenantA, () =>
      single.transaction(async () => {
        acquired();
        await held;
      }),
    );
    await isHeld;
    const waiting = context.runAs(tenantB, () => labels(single.db));
    release();
    await holding;

    expect(await waiting).toContain('b-waiting');
    expect(await waiting).not.toContain('a-1');
  });

  it('does not filter a connection that never set a tenant (migrations, an instance from before RLS)', async () => {
    const pool = new Pool({ connectionString: database.url });
    pools.push(pool);
    const all = await labels(drizzle({ client: pool }));
    expect(all).toEqual(expect.arrayContaining(['a-1', 'b-1']));
  });
});
