import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from '@jest/globals';

import { GoogleOauthStateService } from './google-oauth-state.service';

describe('google oauth state service', () => {
  const service = new GoogleOauthStateService();
  const secret = 's'.repeat(48);

  it('creates and verifies a signed OAuth state payload carrying the supplied nonce', () => {
    const state = service.create(
      { nonce: 'nonce-123', projectId: 'project-1', userId: 'user-1' },
      secret,
    );

    const payload = service.verify(state, secret);

    expect(payload.projectId).toBe('project-1');
    expect(payload.userId).toBe('user-1');
    expect(payload.nonce).toBe('nonce-123');
    expect(payload.expiresAt).toBeGreaterThan(Date.now());
  });

  it('rejects tampered and expired states', () => {
    const state = service.create(
      { nonce: 'nonce-123', projectId: 'project-1', userId: 'user-1' },
      secret,
    );
    const [payload] = state.split('.');

    expect(() => service.verify(`${payload}.bad-signature`, secret)).toThrow(BadRequestException);

    const expired = service.create(
      { nonce: 'nonce-123', projectId: 'project-1', ttlMs: -1000, userId: 'user-1' },
      secret,
    );
    expect(() => service.verify(expired, secret)).toThrow(/expired/);
  });
});
