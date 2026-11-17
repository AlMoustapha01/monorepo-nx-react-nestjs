// Seconde barrière d'isolation des tenants (ADR 0013) : sans import, pour servir aussi aux migrations.

/** Réglage Postgres qui porte le tenant de la transaction ; les politiques `tenant_isolation` le lisent. */
export const TENANT_SETTING = 'app.tenant_id';

/**
 * Lignes visibles et acceptées par la politique `tenant_isolation` de chaque table d'un tenant, recopiée dans les
 * `*.schema.ts` (lus par drizzle-kit, qui n'importent que drizzle-orm) ; un test vérifie que chaque copie est
 * identique. Chaque requête de l'API porte le réglage dans sa transaction : `''` sans tenant, donc aucune ligne. Une
 * connexion qui ne l'a jamais posé (migrations, Drizzle Studio, instance d'avant la RLS) n'est pas filtrée.
 */
export const TENANT_ROWS_SQL = `current_setting('${TENANT_SETTING}', true) is null or tenant_id = nullif(current_setting('${TENANT_SETTING}', true), '')::uuid`;

/** Nom de la politique de chaque table d'un tenant. */
export const TENANT_POLICY = 'tenant_isolation';

/**
 * La RLS ne s'applique pas au propriétaire d'une table, sauf si elle est forcée. drizzle-kit génère les
 * politiques mais pas `FORCE` : les migrations la forcent sur toute table qui a la politique `tenant_isolation`.
 * Seulement celles-là : Graphile Worker active la RLS, sans politique, sur ses tables privées, et ne
 * fonctionnerait plus. Idempotent.
 */
export const FORCE_ROW_LEVEL_SECURITY_SQL = `
do $$
declare
  target record;
begin
  for target in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r', 'p') and c.relrowsecurity and not c.relforcerowsecurity
      and exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polname = '${TENANT_POLICY}')
  loop
    execute format('alter table %I.%I force row level security', target.schema_name, target.table_name);
  end loop;
end
$$`;

/** Vrai si le rôle connecté échappe à la RLS : superutilisateur ou BYPASSRLS. */
export const BYPASSES_RLS_SQL = `select rolsuper or rolbypassrls as bypasses from pg_roles where rolname = current_user`;
