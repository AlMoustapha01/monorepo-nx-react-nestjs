import { Pool, type PoolConfig } from 'pg';
import { TENANT_SETTING } from './row-level-security';

/**
 * Pool qui pose le tenant du contexte, pour la seule transaction en cours (`set_config(…, true)`), avant toute
 * requête : les politiques RLS le lisent (ADR 0013). Rien ne reste sur la connexion : c'est sûr derrière un pooler
 * en mode transaction (PgBouncer), qui peut changer de connexion serveur d'une transaction à l'autre.
 *
 * - Une requête hors transaction (`pool.query`) s'exécute dans une transaction courte : `BEGIN` et réglage en un
 *   aller-retour, la requête, puis `COMMIT`.
 * - Une transaction de `DatabaseSession` pose le tenant juste après son `BEGIN` (`transactionTenant`).
 */
export class TenantScopedPool extends Pool {
  constructor(
    config: PoolConfig,
    private readonly currentTenant: () => string | undefined,
  ) {
    super(config);
  }

  /** Tenant du contexte de l'appelant ; `''` sans tenant, et la base ne montre rien. */
  tenant(): string {
    return this.currentTenant() ?? '';
  }

  // Une signature large plutôt que les surcharges de `pg` : drizzle n'utilise que la forme promesse. La forme
  // callback est refusée : elle passerait sans tenant.
  // oxlint-disable-next-line no-explicit-any -- même type de retour que les surcharges de Pool.query
  override async query(...args: unknown[]): Promise<any> {
    if (args.some((arg) => typeof arg === 'function')) {
      throw new Error('TenantScopedPool does not support callback queries');
    }
    // Lu ici, dans le contexte de l'appelant, avant toute attente.
    const tenant = this.tenant();
    const client = await this.connect();
    try {
      await client.query(
        `begin; select set_config('${TENANT_SETTING}', ${client.escapeLiteral(tenant)}, true)`,
      );
      const result: unknown = await (client.query as (...queryArgs: unknown[]) => Promise<unknown>)(
        ...args,
      );
      await client.query('commit');
      client.release();
      return result;
    } catch (error) {
      // Connexion inutilisable si l'annulation échoue : elle est détruite plutôt que rendue au pool.
      const rollback = await client.query('rollback').then(
        () => undefined,
        (rollbackError: Error) => rollbackError,
      );
      client.release(rollback);
      throw error;
    }
  }
}

/** Tenant à poser après `BEGIN` si la connexion vient d'un `TenantScopedPool` ; sinon (superutilisateur des tests), rien. */
export function transactionTenant(client: unknown): string | undefined {
  return client instanceof TenantScopedPool ? client.tenant() : undefined;
}
