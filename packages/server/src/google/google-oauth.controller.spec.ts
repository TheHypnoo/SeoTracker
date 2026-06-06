import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Request, Response } from 'express';

import { GoogleOauthController } from './google-oauth.controller';

describe('googleOauthController', () => {
  const googleOauthService = {
    buildAuthorizationUrl: jest.fn(() =>
      Promise.resolve({ authorizationUrl: 'https://auth', stateNonce: 'nonce-123' }),
    ),
    completeCallback: jest.fn(() => Promise.resolve(undefined)),
    listConnections: jest.fn(() => Promise.resolve('connections')),
    revokeConnection: jest.fn(() => Promise.resolve({ success: true })),
  };
  const configService = {
    get: jest.fn((key: string) => {
      const values: Record<string, unknown> = {
        APP_URL: 'https://app.seotracker.local',
        COOKIE_DOMAIN: 'localhost',
        COOKIE_SECURE: false,
      };
      return values[key];
    }),
  };
  const controller = new GoogleOauthController(googleOauthService as never, configService as never);

  function makeResponse() {
    return {
      clearCookie: jest.fn(),
      cookie: jest.fn(),
      redirect: jest.fn(),
    } as unknown as Response & {
      clearCookie: jest.Mock;
      cookie: jest.Mock;
      redirect: jest.Mock;
    };
  }

  function makeRequest(cookies: Record<string, string> = {}) {
    return { cookies } as unknown as Request;
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the authorization URL and sets the browser-binding state cookie', async () => {
    const response = makeResponse();

    await expect(controller.start({ sub: 'user-1' }, 'project-1', response)).resolves.toStrictEqual(
      {
        authorizationUrl: 'https://auth',
      },
    );
    expect(googleOauthService.buildAuthorizationUrl).toHaveBeenCalledWith('project-1', 'user-1');
    expect(response.cookie).toHaveBeenCalledWith(
      'gsc_oauth_state',
      'nonce-123',
      expect.objectContaining({ httpOnly: true, sameSite: 'lax' }),
    );
  });

  it('completes the callback with the cookie nonce and clears the cookie', async () => {
    const response = makeResponse();

    await controller.callback(
      'auth-code',
      'state-token',
      undefined,
      makeRequest({ gsc_oauth_state: 'nonce-123' }),
      response,
    );

    expect(googleOauthService.completeCallback).toHaveBeenCalledWith({
      code: 'auth-code',
      state: 'state-token',
      stateCookie: 'nonce-123',
    });
    expect(response.clearCookie).toHaveBeenCalledWith('gsc_oauth_state', expect.any(Object));
    expect(response.redirect).toHaveBeenCalledWith(
      'https://app.seotracker.local/settings/integrations?google=connected',
    );
  });

  it('defaults missing code and state to empty strings on the callback', async () => {
    const response = makeResponse();

    await controller.callback(undefined, undefined, undefined, makeRequest(), response);

    expect(googleOauthService.completeCallback).toHaveBeenCalledWith({
      code: '',
      state: '',
      stateCookie: undefined,
    });
  });

  it('redirects with the error reason without completing the callback', async () => {
    const response = makeResponse();

    await controller.callback(undefined, undefined, 'access_denied', makeRequest(), response);

    expect(googleOauthService.completeCallback).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(
      'https://app.seotracker.local/settings/integrations?google=error&reason=access_denied',
    );
  });

  it('redirects to an error when completing the callback throws', async () => {
    const response = makeResponse();
    googleOauthService.completeCallback.mockRejectedValueOnce(new Error('bad state') as never);

    await controller.callback(
      'auth-code',
      'state-token',
      undefined,
      makeRequest({ gsc_oauth_state: 'mismatch' }),
      response,
    );

    expect(response.redirect).toHaveBeenCalledWith(
      'https://app.seotracker.local/settings/integrations?google=error&reason=invalid_state',
    );
  });

  it('lists active connections for a project', async () => {
    await expect(controller.list({ sub: 'user-1' }, 'project-1')).resolves.toBe('connections');
    expect(googleOauthService.listConnections).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('revokes a connection', async () => {
    await expect(
      controller.revoke({ sub: 'user-1' }, 'project-1', 'connection-1'),
    ).resolves.toStrictEqual({ success: true });
    expect(googleOauthService.revokeConnection).toHaveBeenCalledWith(
      'project-1',
      'connection-1',
      'user-1',
    );
  });
});
