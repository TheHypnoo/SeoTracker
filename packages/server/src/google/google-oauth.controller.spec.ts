import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { Response } from 'express';

import { GoogleOauthController } from './google-oauth.controller';

describe('googleOauthController', () => {
  const googleOauthService = {
    buildAuthorizationUrl: jest.fn(() => Promise.resolve({ authorizationUrl: 'https://auth' })),
    completeCallback: jest.fn(() => Promise.resolve(undefined)),
    listConnections: jest.fn(() => Promise.resolve('connections')),
    revokeConnection: jest.fn(() => Promise.resolve({ success: true })),
  };
  const configService = {
    get: jest.fn(() => 'https://app.seotracker.local'),
  };
  const controller = new GoogleOauthController(googleOauthService as never, configService as never);

  function makeResponse() {
    return { redirect: jest.fn() } as unknown as Response & { redirect: jest.Mock };
  }

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('builds the authorization URL for the current user', async () => {
    await expect(controller.start({ sub: 'user-1' }, 'project-1')).resolves.toStrictEqual({
      authorizationUrl: 'https://auth',
    });
    expect(googleOauthService.buildAuthorizationUrl).toHaveBeenCalledWith('project-1', 'user-1');
  });

  it('completes the callback and redirects to the connected state', async () => {
    const response = makeResponse();

    await controller.callback('auth-code', 'state-token', undefined, response);

    expect(googleOauthService.completeCallback).toHaveBeenCalledWith({
      code: 'auth-code',
      state: 'state-token',
    });
    expect(response.redirect).toHaveBeenCalledWith(
      'https://app.seotracker.local/settings/integrations?google=connected',
    );
  });

  it('defaults missing code and state to empty strings on the callback', async () => {
    const response = makeResponse();

    await controller.callback(undefined, undefined, undefined, response);

    expect(googleOauthService.completeCallback).toHaveBeenCalledWith({ code: '', state: '' });
  });

  it('redirects with the error reason without completing the callback', async () => {
    const response = makeResponse();

    await controller.callback(undefined, undefined, 'access_denied', response);

    expect(googleOauthService.completeCallback).not.toHaveBeenCalled();
    expect(response.redirect).toHaveBeenCalledWith(
      'https://app.seotracker.local/settings/integrations?google=error&reason=access_denied',
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
