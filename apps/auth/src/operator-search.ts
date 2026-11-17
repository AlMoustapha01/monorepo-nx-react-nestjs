import type { Pool } from 'pg';

export interface FoundAccount {
  id: string;
  email: string;
  name: string;
  organizations: { id: string; name: string; role: string }[];
}

/** `%` et `_` saisis par l'opérateur sont cherchés tels quels. */
const likePattern = (query: string) => `%${query.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;

/**
 * Comptes dont l'email, le nom ou une organisation contient la recherche, avec leurs organisations : le back-office
 * choisit ainsi qui impersoner (ADR 0019). 20 au plus ; toutes organisations confondues, réservé aux opérateurs.
 */
export async function searchAccounts(pool: Pool, query: string): Promise<FoundAccount[]> {
  const { rows } = await pool.query<FoundAccount>(
    `select u.id, u.email, u.name,
            coalesce(
              json_agg(json_build_object('id', o.id, 'name', o.name, 'role', m.role) order by o.name)
                filter (where o.id is not null),
              '[]'
            ) as organizations
       from "user" u
       left join member m on m."userId" = u.id
       left join organization o on o.id = m."organizationId"
      where u.id in (
              select u2.id from "user" u2
                left join member m2 on m2."userId" = u2.id
                left join organization o2 on o2.id = m2."organizationId"
               where u2.email ilike $1 or u2.name ilike $1 or o2.name ilike $1
            )
      group by u.id
      order by u.email
      limit 20`,
    [likePattern(query)],
  );
  return rows;
}
