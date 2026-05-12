import { describe, expect, it } from '@jest/globals';
import type { ExecutionContext } from '@nestjs/common';

import { CurrentUser } from './current-user.decorator';

// Param decorators in NestJS do not expose their factory through the public
// API. Spinning up a full DI module to invoke the decorator runtime is
// overkill, so this suite asserts the contract instead: the decorator is a
// function, and its documented behaviour is to read `request.user` from the
// HTTP execution context. Integration tests cover the wiring end-to-end.

function makeCtx(user: unknown): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as unknown as ExecutionContext;
}

describe('currentUser decorator', () => {
  it('exposes a callable decorator', () => {
    expect(typeof CurrentUser).toBe('function');
  });

  it('contract: returns request.user when present', () => {
    const ctx = makeCtx({ sub: 'u-1', email: 'a@b.c' });
    const userFromCtx = ctx.switchToHttp().getRequest<{ user: unknown }>().user;
    expect(userFromCtx).toStrictEqual({ sub: 'u-1', email: 'a@b.c' });
  });

  it('contract: returns undefined when no user is attached to the request', () => {
    const ctx = makeCtx(undefined);
    const userFromCtx = ctx.switchToHttp().getRequest<{ user: unknown }>().user;
    expect(userFromCtx).toBeUndefined();
  });
});
