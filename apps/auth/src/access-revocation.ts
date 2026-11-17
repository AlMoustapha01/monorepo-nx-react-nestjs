import { APIError } from 'better-auth/api';
import type { Pool } from 'pg';
import type { Logger } from 'pino';
// option:sentry:start
import { reportError } from './report-error';
// option:sentry:end

/**
 * Révocation des accès d'un utilisateur dans un tenant (ADR 0016) : l'API refuse ses tokens émis avant. Écrite dans
 * `access.revocations`, table de l'API ; une ligne par utilisateur et par tenant, dont la date avance.
 */
export function createAccessRevoker(pool: Pool, logger: Logger) {
  // Horloge de ce process, qui date aussi les tokens (`iat`) : pas de dérive entre les deux valeurs comparées.
  const write = (tenantId: string, userIds: readonly string[]) =>
    pool.query(
      `insert into access.revocations (tenant_id, user_id, revoked_at)
       select $1, user_id, $3 from unnest($2::uuid[]) as user_id
       on conflict (tenant_id, user_id) do update set revoked_at = excluded.revoked_at`,
      [tenantId, userIds, new Date()],
    );

  return {
    /**
     * Avant l'action : si la révocation ne s'écrit pas, l'action est refusée (503) plutôt que de laisser un accès
     * retiré valable jusqu'à l'expiration du token. Une révocation suivie d'une action en échec ne coûte qu'un
     * nouveau token au client.
     */
    async before(tenantId: string, userIds: readonly string[]): Promise<void> {
      if (userIds.length === 0) return;
      try {
        await write(tenantId, userIds);
      } catch (error) {
        logger.error({ err: error, tenantId }, 'Access revocation failed: action refused');
        // option:sentry:start
        reportError(error, { operation: 'access-revocation' });
        // option:sentry:end
        throw new APIError('SERVICE_UNAVAILABLE', {
          message: 'Access revocation unavailable, try again later',
        });
      }
    },

    /**
     * Après l'action : la date avance à sa fin. Un token émis entre les deux portait encore l'ancien accès ; ceux
     * d'après ont les droits à jour. Au mieux : l'action a déjà eu lieu et la révocation d'avant tient.
     */
    async after(tenantId: string, userIds: readonly string[]): Promise<void> {
      if (userIds.length === 0) return;
      try {
        await write(tenantId, userIds);
      } catch (error) {
        logger.warn(
          { err: error, tenantId },
          'Access revocation not moved to the end of the action',
        );
      }
    },
  };
}
