import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { FeatureFlag } from '@nx-react-nestjs/contracts';
import { CoreError } from '../errors/app-error';
import { FeatureFlags, REQUIRED_FEATURE_KEY } from './feature-flags';

/** Guard global, après l'authentification : n'agit que sur les routes marquées @RequireFeature. */
@Injectable()
export class FeatureFlagsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly flags: FeatureFlags,
  ) {}

  async canActivate(execution: ExecutionContext): Promise<boolean> {
    const flag = this.reflector.getAllAndOverride<FeatureFlag | undefined>(REQUIRED_FEATURE_KEY, [
      execution.getHandler(),
      execution.getClass(),
    ]);
    if (!flag || (await this.flags.isEnabled(flag))) {
      return true;
    }
    throw new CoreError('FEATURE_DISABLED', 'This feature is not available', { flag });
  }
}
