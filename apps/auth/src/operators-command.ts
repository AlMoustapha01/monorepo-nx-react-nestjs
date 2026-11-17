import type { Pool } from 'pg';

/** Rôle Better Auth (plugin admin) des opérateurs de la plateforme : back-office et impersonation (ADR 0019). */
export const OPERATOR_ROLE = 'admin';

const USAGE = 'Usage: operators list | grant <email> | revoke <email>';

/**
 * Opérateurs de la plateforme : `node operators.js list|grant|revoke …`, lancé par l'équipe qui exploite, comme
 * `migrate.js`. Aucune route HTTP ne donne ce rôle : un opérateur ne peut pas en nommer un autre.
 */
export async function runOperatorsCommand(
  pool: Pool,
  args: readonly string[],
): Promise<{ ok: boolean; output: string }> {
  const [command, email] = args;
  if (command === 'list' && !email) {
    const { rows } = await pool.query<{ email: string }>(
      'select email from "user" where role = $1 order by email',
      [OPERATOR_ROLE],
    );
    return { ok: true, output: rows.map((row) => row.email).join('\n') || 'No operator' };
  }
  if ((command === 'grant' || command === 'revoke') && email) {
    const { rowCount } = await pool.query('update "user" set role = $1 where email = $2', [
      command === 'grant' ? OPERATOR_ROLE : 'user',
      email.toLowerCase(),
    ]);
    if (!rowCount) return { ok: false, output: `No account for ${email}` };
    return {
      ok: true,
      output:
        command === 'grant' ? `${email} is now an operator` : `${email} is no longer an operator`,
    };
  }
  return { ok: false, output: USAGE };
}
