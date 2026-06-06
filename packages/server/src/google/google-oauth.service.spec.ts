import { describe, expect, it, jest } from '@jest/globals';
import { Permission } from '@seotracker/shared-types';

import { GOOGLE_OAUTH_SCOPE } from './google-oauth.constants';
import { GoogleOauthService } from './google-oauth.service';

const CONFIG: Record<string, string> = {
  GOOGLE_CLIENT_ID: 'client-id',
  GOOGLE_CLIENT_SECRET: 'client-secret',
  GOOGLE_OAUTH_REDIRECT_URI: 'https://api.test/api/v1/google/oauth/callback',
  GOOGLE_TOKEN_ENCRYPTION_KEY: 'k'.repeat(48),
  JWT_ACCESS_SECRET: 'j'.repeat(48),
};

function makeService(overrides: { existingConnections?: unknown[] } = {}) {
  const returning = jest.fn().mockResolvedValue([
    {
      id: 'connection-1',
      projectId: 'project-1',
      connectedByUserId: 'user-1',
      googleAccountEmail: 'owner@example.com',
      scopes: [GOOGLE_OAUTH_SCOPE],
      expiresAt: new Date('2026-06-05T12:00:00.000Z'),
      revokedAt: null,
      createdAt: new Date('2026-06-05T11:00:00.000Z'),
      updatedAt: new Date('2026-06-05T11:00:00.000Z'),
    },
  ]);
  const values = jest.fn().mockReturnValue({ returning });
  const limit = jest.fn().mockResolvedValue(overrides.existingConnections ?? []);
  const where = jest.fn().mockReturnValue({ limit });
  const from = jest.fn().mockReturnValue({ where });
  const db = {
    insert: jest.fn().mockReturnValue({ values }),
    select: jest.fn().mockReturnValue({ from }),
  };
  const configService = { get: jest.fn((key: string) => CONFIG[key]) };
  const projectsService = { assertPermission: jest.fn().mockResolvedValue(undefined) };
  const stateService = {
    create: jest.fn().mockReturnValue('signed-state'),
    verify: jest.fn().mockReturnValue({ projectId: 'project-1', userId: 'user-1' }),
  };
  const oauthClient = {
    exchangeCode: jest.fn().mockResolvedValue({
      access_token: 'raw-access-token',
      expires_in: 3600,
      refresh_token: 'raw-refresh-token',
      scope: GOOGLE_OAUTH_SCOPE,
    }),
    getUserInfo: jest.fn().mockResolvedValue({ email: 'Owner@Example.COM' }),
  };
  const tokenEncryptionService = {
    encrypt: jest.fn((token: string) => `encrypted:${token}`),
  };

  const service = new GoogleOauthService(
    db as never,
    configService as never,
    projectsService as never,
    stateService as never,
    oauthClient as never,
    tokenEncryptionService as never,
  );

  return {
    db,
    oauthClient,
    projectsService,
    service,
    stateService,
    tokenEncryptionService,
    values,
  };
}

describe('google oauth service', () => {
  it('builds a Google authorization URL with readonly Search Console scope', async () => {
    const { projectsService, service, stateService } = makeService();

    const result = await service.buildAuthorizationUrl('project-1', 'user-1');
    const url = new URL(result.authorizationUrl);

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.OUTBOUND_WRITE,
    );
    expect(stateService.create).toHaveBeenCalledWith(
      { projectId: 'project-1', userId: 'user-1' },
      CONFIG.JWT_ACCESS_SECRET,
    );
    expect(url.searchParams.get('scope')).toContain(GOOGLE_OAUTH_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });

  it('stores encrypted Google tokens and normalized account email on callback', async () => {
    const { oauthClient, projectsService, service, tokenEncryptionService, values } = makeService();

    const result = await service.completeCallback({ code: 'oauth-code', state: 'signed-state' });

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.OUTBOUND_WRITE,
    );
    expect(oauthClient.exchangeCode).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'oauth-code' }),
    );
    expect(tokenEncryptionService.encrypt).toHaveBeenCalledWith(
      'raw-refresh-token',
      CONFIG.GOOGLE_TOKEN_ENCRYPTION_KEY,
    );
    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        accessTokenEncrypted: 'encrypted:raw-access-token',
        googleAccountEmail: 'owner@example.com',
        refreshTokenEncrypted: 'encrypted:raw-refresh-token',
      }),
    );
    expect(result.googleAccountEmail).toBe('owner@example.com');
  });
});
