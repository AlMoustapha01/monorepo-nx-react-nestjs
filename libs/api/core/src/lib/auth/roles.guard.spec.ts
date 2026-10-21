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

  it('laisse passer une route sans exigence de rôle', () =>
    as([], () => expect(guard.canActivate(executionFor('browse'))).toBe(true)));

  it('laisse passer un principal qui a le rôle requis', () =>
    as(['staff'], () => expect(guard.canActivate(executionFor('manage'))).toBe(true)));

  it('refuse un principal sans le rôle requis, en 403', () =>
    as([], () =>
      expect(() => guard.canActivate(executionFor('manage'))).toThrow(
        expect.objectContaining({ code: 'FORBIDDEN', kind: 'FORBIDDEN' }),
      ),
    ));
});
