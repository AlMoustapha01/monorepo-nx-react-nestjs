import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { type Database, InjectDatabase } from './database.tokens';
import { TENANT_SETTING } from './row-level-security';
import { transactionTenant } from './tenant-scoped-pool';

type DatabaseTransaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** Ce que les cas d'usage voient : un périmètre transactionnel, sans rien savoir de Drizzle. */
export abstract class TransactionManager {
  /** Exécute `fn` dans une transaction ; réutilise la transaction en cours si elle existe. */
  abstract transaction<T>(fn: () => Promise<T>): Promise<T>;
}

/**
 * Connexion courante pour l'infra : la transaction en cours si un cas d'usage en a ouvert une,
 * sinon le pool. C'est ce qui permet au repository et à l'outbox d'écrire dans la même transaction.
 */
@Injectable()
export class DatabaseSession extends TransactionManager {
  private readonly current = new AsyncLocalStorage<DatabaseTransaction>();

  constructor(@InjectDatabase() private readonly root: Database) {
    super();
  }

  get db(): Omit<Database, '$client'> {
    return this.current.getStore() ?? this.root;
  }

  get inTransaction(): boolean {
    return this.current.getStore() !== undefined;
  }

  transaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.inTransaction) {
      return fn();
    }
    // Lu avant le BEGIN, dans le contexte de l'appelant ; posé pour cette seule transaction (ADR 0013).
    const tenant = transactionTenant((this.root as { $client?: unknown }).$client);
    return this.root.transaction(async (tx) => {
      if (tenant !== undefined) {
        await tx.execute(sql`select set_config(${TENANT_SETTING}, ${tenant}, true)`);
      }
      return this.current.run(tx, fn);
    });
  }
}
