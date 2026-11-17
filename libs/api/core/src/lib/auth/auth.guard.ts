import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { RequestContext } from '../context/request-context';
import { CoreError } from '../errors/app-error';
import { AccessRevocations } from './access-revocations';
import { JwtVerifier } from './jwt-verifier';
import { IS_PUBLIC_KEY } from './public.decorator';

/** Guard global : refuse par défaut, sauf route marquée @Public(). */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly verifier: JwtVerifier,
    private readonly revocations: AccessRevocations,
    private readonly context: RequestContext,
    private readonly logger: PinoLogger,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = execution.switchToHttp().getRequest<Request>();
    const token = extractBearerToken(request.headers.authorization);
    if (!token) {
      throw new CoreError('UNAUTHENTICATED', 'Missing bearer token');
    }

    const { principal, issuedAt } = await this.verifier.authenticate(token);
    this.context.setPrincipal(principal);
    // Après le principal : la liste se lit au nom de son tenant (RLS).
    if (await this.revocations.isRevoked(principal, issuedAt)) {
      this.logger.info(
        { tenantId: principal.tenantId, userId: principal.userId },
        'Revoked access token refused',
      );
      throw new CoreError('UNAUTHENTICATED', 'Invalid or expired access token');
    }
    this.logger.assign({ tenantId: principal.tenantId, userId: principal.userId });
    return true;
  }
}

function extractBearerToken(header: string | undefined): string | undefined {
  const [scheme, token] = header?.split(' ') ?? [];
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}
