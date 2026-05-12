import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request, Response } from 'express';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

function makeRequest(cookies: Record<string, string> = {}) {
  return { cookies } as unknown as Request;
}
const RES = {} as Response;

describe('AuthController', () => {
  let controller: AuthController;
  let authService: {
    register: jest.Mock;
    login: jest.Mock;
    refresh: jest.Mock;
    logout: jest.Mock;
    requestPasswordReset: jest.Mock;
    resetPassword: jest.Mock;
    getSession: jest.Mock;
  };
  let config: { get: jest.Mock };

  beforeEach(async () => {
    authService = {
      register: jest.fn().mockResolvedValue({}),
      login: jest.fn().mockResolvedValue({}),
      refresh: jest.fn().mockResolvedValue({}),
      logout: jest.fn().mockResolvedValue({}),
      requestPasswordReset: jest.fn().mockResolvedValue({}),
      resetPassword: jest.fn().mockResolvedValue({}),
      getSession: jest.fn().mockResolvedValue({ id: 'u1' }),
    };
    config = {
      get: jest.fn((key: string) =>
        key === 'REFRESH_COOKIE_NAME' ? 'refresh_token' : 'csrf_token',
      ),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    controller = moduleRef.get(AuthController);
  });

  it('register delegates to authService.register with body + response', () => {
    const body = { email: 'a@b.c', name: 'A', password: 'pw' };
    controller.register(body as never, RES);
    expect(authService.register).toHaveBeenCalledWith(body, RES);
  });

  it('login delegates to authService.login', () => {
    const body = { email: 'a@b.c', password: 'pw' };
    controller.login(body as never, RES);
    expect(authService.login).toHaveBeenCalledWith(body, RES);
  });

  it('uses route-level default throttles for credential endpoints', () => {
    const handler = AuthController.prototype.login;

    expect(Reflect.getMetadata('THROTTLER:LIMITdefault', handler)).toBe(5);
    expect(Reflect.getMetadata('THROTTLER:TTLdefault', handler)).toBe(60_000);
    expect(Reflect.getMetadata('THROTTLER:LIMITauth', handler)).toBeUndefined();
    expect(Reflect.getMetadata('THROTTLER:TTLauth', handler)).toBeUndefined();
  });

  it('refresh extracts both cookies + csrf header and delegates', () => {
    const req = makeRequest({ refresh_token: 'rt-abc', csrf_token: 'csrf' });
    controller.refresh(req, 'csrf', RES);
    expect(authService.refresh).toHaveBeenCalledWith('rt-abc', 'csrf', 'csrf', RES);
  });

  it('session delegates to authService.getSession with the refresh cookie', () => {
    const req = makeRequest({ refresh_token: 'rt-abc' });
    controller.session(req);
    expect(authService.getSession).toHaveBeenCalledWith('rt-abc');
  });

  it('does not throttle read-only session checks used by SSR route guards', () => {
    const handler = AuthController.prototype.session;

    expect(Reflect.getMetadata('THROTTLER:SKIPdefault', handler)).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:SKIPburst', handler)).toBe(true);
    expect(Reflect.getMetadata('THROTTLER:SKIPauth', handler)).toBeUndefined();
    expect(Reflect.getMetadata('THROTTLER:SKIPbadge', handler)).toBeUndefined();
  });

  it('logout delegates with refresh cookie + csrf header + cookie + response', () => {
    const req = makeRequest({ refresh_token: 'rt-abc', csrf_token: 'csrf' });
    controller.logout(req, 'csrf', RES);
    expect(authService.logout).toHaveBeenCalledWith('rt-abc', 'csrf', 'csrf', RES);
  });

  it('forgotPassword delegates to requestPasswordReset', () => {
    controller.forgotPassword({ email: 'a@b.c' } as never);
    expect(authService.requestPasswordReset).toHaveBeenCalledWith('a@b.c');
  });

  it('resetPassword delegates with token + password', () => {
    controller.resetPassword({ token: 't', password: 'newpw' } as never);
    expect(authService.resetPassword).toHaveBeenCalledWith('t', 'newpw');
  });

  describe('me', () => {
    it('returns the authenticated user as { id, email }', () => {
      const out = controller.me({ sub: 'u-1', email: 'a@b.c' });
      expect(out).toStrictEqual({ id: 'u-1', email: 'a@b.c' });
    });

    it('throws UnauthorizedException when CurrentUser is missing', () => {
      expect(() => controller.me(undefined)).toThrow(UnauthorizedException);
    });
  });
});
