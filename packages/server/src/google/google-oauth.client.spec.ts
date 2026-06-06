import { BadGatewayException } from '@nestjs/common';
import { afterEach, describe, expect, it, jest } from '@jest/globals';

import { GOOGLE_OAUTH_TOKEN_URL, GOOGLE_USERINFO_URL } from './google-oauth.constants';
import { GoogleOauthClient } from './google-oauth.client';

describe('google oauth client', () => {
  const service = new GoogleOauthClient();

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exchanges an OAuth code for tokens', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ access_token: 'access', refresh_token: 'refresh' }),
      ok: true,
    } as Response);

    const result = await service.exchangeCode({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      code: 'code',
      redirectUri: 'https://api.test/callback',
    });

    expect(result.access_token).toBe('access');
    expect(fetchMock).toHaveBeenCalledWith(
      GOOGLE_OAUTH_TOKEN_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('loads Google userinfo with the access token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ email: 'user@example.com' }),
      ok: true,
    } as Response);

    await expect(service.getUserInfo('access')).resolves.toStrictEqual({
      email: 'user@example.com',
    });
    expect(fetchMock).toHaveBeenCalledWith(GOOGLE_USERINFO_URL, {
      headers: { authorization: 'Bearer access' },
    });
  });

  it('refreshes an OAuth access token', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      json: async () => ({ access_token: 'new-access', expires_in: 3600 }),
      ok: true,
    } as Response);

    const result = await service.refreshAccessToken({
      clientId: 'client-id',
      clientSecret: 'client-secret',
      refreshToken: 'refresh',
    });

    expect(result.access_token).toBe('new-access');
    expect(fetchMock).toHaveBeenCalledWith(
      GOOGLE_OAUTH_TOKEN_URL,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('raises a gateway error when Google rejects a request', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: false, status: 400 } as Response);

    await expect(
      service.exchangeCode({
        clientId: 'client-id',
        clientSecret: 'client-secret',
        code: 'code',
        redirectUri: 'https://api.test/callback',
      }),
    ).rejects.toThrow(BadGatewayException);
  });
});
