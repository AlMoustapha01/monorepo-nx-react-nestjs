import { Injectable } from '@nestjs/common';
import { ClsService, type ClsStore } from 'nestjs-cls';
import { CoreError } from '../errors/app-error';

export interface Principal {
  userId: string;
  tenantId: string;
  /** Claim `email` du token, si le fournisseur d'identité le transmet. */
  email?: string;
}

interface RequestContextStore extends ClsStore {
  principal?: Principal;
}

/**
 * Contexte de la requête courante (AsyncLocalStorage).
 * Les repositories y lisent le tenant : aucun ID client n'est utilisé tel quel pour filtrer.
 */
@Injectable()
export class RequestContext {
  constructor(private readonly cls: ClsService<RequestContextStore>) {}

  get requestId(): string | undefined {
    return this.cls.getId();
  }

  get principal(): Principal | undefined {
    return this.cls.isActive() ? this.cls.get('principal') : undefined;
  }

  get tenantId(): string {
    return this.requirePrincipal().tenantId;
  }

  get userId(): string {
    return this.requirePrincipal().userId;
  }

  setPrincipal(principal: Principal): void {
    this.cls.set('principal', principal);
  }

  /** Exécute `fn` au nom d'un principal, hors requête HTTP (jobs, scripts, tests). */
  runAs<T>(principal: Principal, fn: () => T): T {
    return this.cls.run(() => {
      this.setPrincipal(principal);
      return fn();
    });
  }

  private requirePrincipal(): Principal {
    const principal = this.principal;
    if (!principal) {
      throw new CoreError('TENANT_CONTEXT_MISSING', 'No tenant in the current request context');
    }
    return principal;
  }
}
