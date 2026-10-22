import { createHash } from 'node:crypto';
import {
  applyDecorators,
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  SetMetadata,
  UseInterceptors,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiHeader } from '@nestjs/swagger';
import { and, eq, lt } from 'drizzle-orm';
import type { Request, Response } from 'express';
import { from, lastValueFrom, type Observable } from 'rxjs';
import { RequestContext } from '../../context/request-context';
import { DatabaseSession } from '../../database/database-session';
import { CoreError } from '../../errors/app-error';
import { idempotencyKeys } from './idempotency.schema';

const IDEMPOTENCY_TTL_MS = 24 * 3600 * 1000;
const IDEMPOTENT_KEY = 'http:idempotent';
/** ASCII imprimable, 1 à 255 caractères (un UUID v4 généré par le client est l'usage courant). */
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

interface IdempotentOptions {
  /** true : une requête sans `Idempotency-Key` est refusée (400). */
  required?: boolean;
}

/**
 * Rend une route rejouable sans effet de bord : le client envoie `Idempotency-Key` et peut
 * répéter la requête (timeout, coupure réseau) ; la réponse d'origine est rejouée.
 */
export const Idempotent = (options: IdempotentOptions = {}) =>
  applyDecorators(
    SetMetadata(IDEMPOTENT_KEY, options),
    UseInterceptors(IdempotencyInterceptor),
    ApiHeader({
      name: 'Idempotency-Key',
      required: options.required ?? false,
      description: 'Identifiant unique de la requête (UUID conseillé), réutilisé en cas de retry.',
    }),
  );

@Injectable()
class IdempotencyInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly session: DatabaseSession,
    private readonly context: RequestContext,
  ) {}

  intercept(execution: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<IdempotentOptions>(IDEMPOTENT_KEY, execution.getHandler());
    const request = execution.switchToHttp().getRequest<Request>();
    const response = execution.switchToHttp().getResponse<Response>();
    const key = request.header('idempotency-key');

    if (key === undefined) {
      if (options.required) {
        throw new CoreError(
          'IDEMPOTENCY_KEY_REQUIRED',
          'This request requires an Idempotency-Key header',
        );
      }
      return next.handle();
    }
    if (!KEY_PATTERN.test(key)) {
      throw new CoreError(
        'INVALID_IDEMPOTENCY_KEY',
        'Idempotency-Key must be 1 to 255 printable ASCII characters',
      );
    }

    return from(this.run(key, fingerprintOf(request), response, next));
  }

  /**
   * Tout se passe dans une transaction, que le cas d'usage rejoint (DatabaseSession) :
   * - la clé est insérée d'abord ; une requête concurrente avec la même clé attend sur
   *   l'index unique, puis trouve la réponse validée et la rejoue ;
   * - en cas d'erreur, la transaction annule aussi la clé : la requête peut être retentée.
   */
  private run(
    key: string,
    fingerprint: string,
    response: Response,
    next: CallHandler,
  ): Promise<unknown> {
    const scope = and(
      eq(idempotencyKeys.tenantId, this.context.tenantId),
      eq(idempotencyKeys.userId, this.context.userId),
      eq(idempotencyKeys.key, key),
    );
    return this.session.transaction(async () => {
      const now = new Date();
      await this.session.db
        .delete(idempotencyKeys)
        .where(and(scope, lt(idempotencyKeys.expiresAt, now)));
      const [claimed] = await this.session.db
        .insert(idempotencyKeys)
        .values({
          tenantId: this.context.tenantId,
          userId: this.context.userId,
          key,
          fingerprint,
          createdAt: now,
          expiresAt: new Date(now.getTime() + IDEMPOTENCY_TTL_MS),
        })
        .onConflictDoNothing()
        .returning({ key: idempotencyKeys.key });

      if (!claimed) {
        const [existing] = await this.session.db
          .select()
          .from(idempotencyKeys)
          .where(scope)
          .limit(1);
        if (existing?.fingerprint !== fingerprint) {
          throw new CoreError(
            'IDEMPOTENCY_KEY_REUSED',
            'This Idempotency-Key was already used for a different request',
          );
        }
        response.setHeader('Idempotent-Replayed', 'true');
        return existing.response;
      }

      const result: unknown = await lastValueFrom(next.handle(), { defaultValue: null });
      await this.session.db
        .update(idempotencyKeys)
        .set({ response: result ?? null })
        .where(scope);
      return result;
    });
  }
}

function fingerprintOf(request: Request): string {
  const path = request.originalUrl.split('?', 1)[0];
  return createHash('sha256')
    .update(`${request.method} ${path}\n${JSON.stringify(request.body ?? null)}`)
    .digest('hex');
}
