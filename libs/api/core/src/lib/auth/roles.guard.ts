import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RequestContext } from '../context/request-context';
import { CoreError } from '../errors/app-error';
import { REQUIRED_ROLES_KEY, type Role } from './roles';

/** Guard global, après l'authentification : n'agit que sur les routes marquées @RequireRole. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly context: RequestContext,
  ) {}

  canActivate(execution: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(REQUIRED_ROLES_KEY, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    if (!required || required.some((role) => this.context.hasRole(role))) {
      return true;
    }
    throw new CoreError('FORBIDDEN', 'This action requires another role', { required });
  }
}
