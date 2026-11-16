import { Pool, type PoolClient, type PoolConfig } from 'pg';
import { SET_TENANT_SQL } from './row-level-security';

type ConnectCallback = (
  error: Error | undefined,
  client: PoolClient | undefined,
  done: (release?: unknown) => void,
) => void;

/**
 * Pool qui pose le tenant du contexte sur chaque connexion qu'il prête, avant toute requête : les
 * politiques RLS le lisent (ADR 0013). Couvre les transactions et les lectures hors transaction
 * (`pool.query` emprunte une connexion par `connect`). Chaque emprunt écrase le tenant précédent :
 * une connexion rendue au pool ne garde jamais celui d'une autre requête.
 */
export class TenantScopedPool extends Pool {
  constructor(
    config: PoolConfig,
    private readonly currentTenant: () => string | undefined,
  ) {
    super(config);
  }

  override connect(): Promise<PoolClient>;
  override connect(callback: ConnectCallback): void;
  override connect(callback?: ConnectCallback): Promise<PoolClient> | void {
    // Lu à l'appel, dans le contexte de l'appelant : une connexion libérée plus tard par une autre
    // requête (pool plein) ne lui transmet pas son tenant.
    const tenant = this.currentTenant() ?? '';
    const ready = super.connect().then(async (client) => {
      try {
        await client.query(SET_TENANT_SQL, [tenant]);
      } catch (error) {
        client.release(error as Error);
        throw error;
      }
      return client;
    });
    if (!callback) {
      return ready;
    }
    ready.then(
      (client) => callback(undefined, client, (release) => client.release(release as Error)),
      (error: Error) => callback(error, undefined, () => undefined),
    );
  }
}
