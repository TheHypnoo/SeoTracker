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

function connectionRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'connection-1',
    projectId: 'project-1',
    userId: 'user-1',
    connectedByUserId: 'user-1',
    googleAccountEmail: 'owner@example.com',
    accessTokenEncrypted: 'encrypted:stored-access',
    refreshTokenEncrypted: 'encrypted:stored-refresh',
    scopes: [GOOGLE_OAUTH_SCOPE],
    expiresAt: new Date('2026-06-05T12:00:00.000Z'),
    revokedAt: null,
    createdAt: new Date('2026-06-05T11:00:00.000Z'),
    updatedAt: new Date('2026-06-05T11:00:00.000Z'),
    ...overrides,
  };
}

function makeService(
  overrides: { existingConnections?: unknown[]; config?: Record<string, string> } = {},
) {
  const insertReturning = jest.fn().mockResolvedValue([connectionRow()]);
  const values = jest.fn().mockReturnValue({ returning: insertReturning });
  const selectLimit = jest.fn().mockResolvedValue(overrides.existingConnections ?? []);
  const selectOrderBy = jest.fn().mockResolvedValue(overrides.existingConnections ?? []);
  const selectWhere = jest.fn().mockReturnValue({ limit: selectLimit, orderBy: selectOrderBy });
  const from = jest.fn().mockReturnValue({ where: selectWhere });
  const updateReturning = jest.fn().mockResolvedValue([connectionRow()]);
  const updateWhere = jest.fn().mockReturnValue({ returning: updateReturning });
  const set = jest.fn().mockReturnValue({ where: updateWhere });
  const deleteWhere = jest.fn().mockResolvedValue(undefined);
  const deleteFn = jest.fn().mockReturnValue({ where: deleteWhere });
  const transaction = jest.fn();
  const db = {
    delete: deleteFn,
    insert: jest.fn().mockReturnValue({ values }),
    select: jest.fn().mockReturnValue({ from }),
    update: jest.fn().mockReturnValue({ set }),
    transaction,
  };
  // The transaction runs its callback against the same mock db (acting as the tx handle).
  transaction.mockImplementation((callback: (tx: typeof db) => unknown) => callback(db));
  const config = overrides.config ?? CONFIG;
  const configService = { get: jest.fn((key: string) => config[key]) };
  const projectsService = { assertPermission: jest.fn().mockResolvedValue(undefined) };
  const stateService = {
    create: jest.fn().mockReturnValue('signed-state'),
    verify: jest
      .fn()
      .mockReturnValue({ nonce: 'nonce-123', projectId: 'project-1', userId: 'user-1' }),
  };
  const oauthClient = {
    exchangeCode: jest.fn().mockResolvedValue({
      access_token: 'raw-access-token',
      expires_in: 3600,
      refresh_token: 'raw-refresh-token',
      scope: GOOGLE_OAUTH_SCOPE,
    }),
    getUserInfo: jest.fn().mockResolvedValue({ email: 'Owner@Example.COM' }),
    refreshAccessToken: jest.fn().mockResolvedValue({
      access_token: 'refreshed-access-token',
      expires_in: 3600,
    }),
  };
  const tokenEncryptionService = {
    encrypt: jest.fn((token: string) => `encrypted:${token}`),
    decrypt: jest.fn((token: string) => `decrypted:${token}`),
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
    deleteWhere,
    insertReturning,
    oauthClient,
    projectsService,
    selectOrderBy,
    service,
    set,
    stateService,
    tokenEncryptionService,
    updateReturning,
    updateWhere,
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
      expect.objectContaining({
        projectId: 'project-1',
        userId: 'user-1',
        nonce: expect.any(String),
      }),
      CONFIG.JWT_ACCESS_SECRET,
    );
    expect(url.searchParams.get('scope')).toContain(GOOGLE_OAUTH_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('prompt')).toBe('consent');
  });

  it('throws when Google OAuth is not configured', async () => {
    const { service } = makeService({ config: {} });

    await expect(service.buildAuthorizationUrl('project-1', 'user-1')).rejects.toThrow(
      'Google OAuth is not configured',
    );
  });

  it('stores encrypted Google tokens and normalized account email on callback', async () => {
    const { oauthClient, projectsService, service, tokenEncryptionService, values } = makeService();

    const result = await service.completeCallback({
      code: 'oauth-code',
      state: 'signed-state',
      stateCookie: 'nonce-123',
    });

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

  it('rejects a callback missing the OAuth code or state', async () => {
    const { service } = makeService();

    await expect(service.completeCallback({ code: '', state: 'signed' })).rejects.toThrow(
      'Missing OAuth code',
    );
    await expect(service.completeCallback({ code: 'code', state: '' })).rejects.toThrow(
      'Missing OAuth state',
    );
  });

  it('rejects a callback whose userinfo lacks an email', async () => {
    const { oauthClient, service } = makeService();
    oauthClient.getUserInfo.mockResolvedValueOnce({ email: undefined } as never);

    await expect(
      service.completeCallback({
        code: 'oauth-code',
        state: 'signed-state',
        stateCookie: 'nonce-123',
      }),
    ).rejects.toThrow('did not include an email');
  });

  it('rejects a callback with no browser-binding cookie', async () => {
    const { oauthClient, service } = makeService();

    await expect(
      service.completeCallback({ code: 'oauth-code', state: 'signed-state' }),
    ).rejects.toThrow('does not match this browser session');
    // The code is never exchanged when the browser binding fails.
    expect(oauthClient.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a callback whose cookie nonce does not match the state nonce', async () => {
    const { oauthClient, service } = makeService();

    await expect(
      service.completeCallback({ code: 'oauth-code', state: 'signed-state', stateCookie: 'other' }),
    ).rejects.toThrow('does not match this browser session');
    expect(oauthClient.exchangeCode).not.toHaveBeenCalled();
  });

  it('rejects a callback whose state was already consumed or expired', async () => {
    const { oauthClient, service, updateReturning } = makeService();
    updateReturning.mockResolvedValueOnce([]); // atomic consume matched no row

    await expect(
      service.completeCallback({
        code: 'oauth-code',
        state: 'signed-state',
        stateCookie: 'nonce-123',
      }),
    ).rejects.toThrow('invalid or already used');
    expect(oauthClient.exchangeCode).not.toHaveBeenCalled();
  });

  it('refreshes tokens on an existing connection when a new refresh token is returned', async () => {
    const { service, updateWhere, values } = makeService({
      existingConnections: [connectionRow()],
    });

    await service.completeCallback({
      code: 'oauth-code',
      state: 'signed-state',
      stateCookie: 'nonce-123',
    });

    // Existing connection is updated, not inserted. updateWhere fires twice: once to consume the
    // OAuth state nonce, once to update the connection.
    expect(values).not.toHaveBeenCalled();
    expect(updateWhere).toHaveBeenCalledTimes(2);
  });

  it('keeps the stored refresh token when the callback omits a new one', async () => {
    const { oauthClient, service, set } = makeService({ existingConnections: [connectionRow()] });
    oauthClient.exchangeCode.mockResolvedValueOnce({
      access_token: 'raw-access-token',
      expires_in: 3600,
      scope: GOOGLE_OAUTH_SCOPE,
    } as never);

    await service.completeCallback({
      code: 'oauth-code',
      state: 'signed-state',
      stateCookie: 'nonce-123',
    });

    // The update set does not touch refreshTokenEncrypted in this branch.
    expect(set).toHaveBeenCalledWith(
      expect.not.objectContaining({ refreshTokenEncrypted: expect.anything() }),
    );
  });

  it('defaults scopes and null expiry when the token response omits them', async () => {
    const { oauthClient, service, values } = makeService();
    oauthClient.exchangeCode.mockResolvedValueOnce({
      access_token: 'raw-access-token',
      refresh_token: 'raw-refresh-token',
    } as never);

    await service.completeCallback({
      code: 'oauth-code',
      state: 'signed-state',
      stateCookie: 'nonce-123',
    });

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({ expiresAt: null, scopes: [GOOGLE_OAUTH_SCOPE] }),
    );
  });

  it('lists active connections ordered by creation date', async () => {
    const { projectsService, selectOrderBy, service } = makeService();
    selectOrderBy.mockResolvedValueOnce([connectionRow()] as never);

    const rows = await service.listConnections('project-1', 'user-1');

    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.OUTBOUND_READ,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ googleAccountEmail: 'owner@example.com' });
  });

  it('revokes a connection and unlinks its properties under outbound write permission', async () => {
    const { deleteWhere, projectsService, service, updateWhere } = makeService();

    await expect(
      service.revokeConnection('project-1', 'connection-1', 'user-1'),
    ).resolves.toStrictEqual({ success: true });
    expect(projectsService.assertPermission).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      Permission.OUTBOUND_WRITE,
    );
    expect(updateWhere).toHaveBeenCalledTimes(1);
    // The connection's site links are removed so the worker stops importing through it.
    expect(deleteWhere).toHaveBeenCalledTimes(1);
  });

  it('throws and unlinks nothing when the connection does not belong to the project', async () => {
    const { deleteWhere, service, updateReturning } = makeService();
    // Project-scoped UPDATE matched no row (e.g. a connectionId from another project).
    updateReturning.mockResolvedValueOnce([]);

    await expect(
      service.revokeConnection('project-1', 'connection-from-another-project', 'user-1'),
    ).rejects.toThrow('Google OAuth connection not found');
    expect(deleteWhere).not.toHaveBeenCalled();
  });

  it('returns the stored access token without refreshing when it is still valid', async () => {
    const { service, tokenEncryptionService } = makeService({
      existingConnections: [connectionRow({ expiresAt: new Date(Date.now() + 3_600_000) })],
    });

    const result = await service.getValidAccessToken('project-1', 'connection-1');

    expect(result.accessToken).toBe('decrypted:encrypted:stored-access');
    expect(tokenEncryptionService.decrypt).toHaveBeenCalledTimes(1);
  });

  it('refreshes an expired access token and persists the new credentials', async () => {
    const { oauthClient, service, updateReturning } = makeService({
      existingConnections: [connectionRow({ expiresAt: new Date(Date.now() - 1_000) })],
    });

    const result = await service.getValidAccessToken('project-1', 'connection-1');

    expect(oauthClient.refreshAccessToken).toHaveBeenCalledWith(
      expect.objectContaining({ refreshToken: 'decrypted:encrypted:stored-refresh' }),
    );
    expect(updateReturning).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('refreshed-access-token');
  });

  it('throws when the connection to refresh does not exist', async () => {
    const { service } = makeService({ existingConnections: [] });

    await expect(service.getValidAccessToken('project-1', 'missing')).rejects.toThrow(
      'Google OAuth connection not found',
    );
  });

  it('throws when an expired connection has no refresh token', async () => {
    const { service } = makeService({
      existingConnections: [
        connectionRow({ expiresAt: new Date(Date.now() - 1_000), refreshTokenEncrypted: null }),
      ],
    });

    await expect(service.getValidAccessToken('project-1', 'connection-1')).rejects.toThrow(
      'cannot be refreshed',
    );
  });
});
