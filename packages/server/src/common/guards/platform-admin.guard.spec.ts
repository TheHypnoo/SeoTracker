import { describe, expect, it } from '@jest/globals';
import { ForbiddenException } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';

import type { Env } from '../../config/env.schema';
import { PlatformAdminGuard } from './platform-admin.guard';

function contextWithUser(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function makeGuard(allowlist: string | undefined) {
  const configService = {
    get: () => allowlist,
  } as unknown as ConfigService<Env, true>;
  return new PlatformAdminGuard(configService);
}

describe('platformAdminGuard', () => {
  it('allows a user whose email is in the allowlist', () => {
    const guard = makeGuard('admin@x.com');
    expect(guard.canActivate(contextWithUser({ sub: 'u1', email: 'admin@x.com' }))).toBe(true);
  });

  it('rejects a user who is not a platform admin', () => {
    const guard = makeGuard('admin@x.com');
    expect(() => guard.canActivate(contextWithUser({ sub: 'u2', email: 'member@x.com' }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no authenticated user', () => {
    const guard = makeGuard('admin@x.com');
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(ForbiddenException);
  });
});
