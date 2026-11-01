import { randomUUID } from 'node:crypto';
import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { createTestRequestContext } from '../../testing';
import { type Role, RequireRole } from './roles';
import { RolesGuard } from './roles.guard';

class Routes {
  @RequireRole('staff')
  manage(): void {}

  browse(): void {}
}

const executionFor = (handler: keyof Routes): ExecutionContext =>
  ({
    getHandler: () => Routes.prototype[handler],
    getClass: () => Routes,
  }) as unknown as ExecutionContext;

describe('RolesGuard', () => {
  const context = createTestRequestContext();
  const guard = new RolesGuard(new Reflector(), context);
  const as = (roles: Role[], fn: () => void) =>
    context.runAs({ userId: randomUUID(), tenantId: randomUUID(), roles }, fn);

  it('allows a route with no role requirement', () =>
    as([], () => expect(guard.canActivate(executionFor('browse'))).toBe(true)));

  it('allows a principal that has the required role', () =>
    as(['staff'], () => expect(guard.canActivate(executionFor('manage'))).toBe(true)));

  it('rejects a principal without the required role, with 403', () =>
    as([], () =>
      expect(() => guard.canActivate(executionFor('manage'))).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN', kind: 'FORBIDDEN' }),
      ),
    ));
});
