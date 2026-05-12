import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';

import { resolveThrottleTracker } from './user-throttler.guard';

function bearer(sub: string) {
  const payload = Buffer.from(JSON.stringify({ sub })).toString('base64url');
  return `Bearer header.${payload}.signature`;
}

function request(overrides: Partial<Request> & { originalUrl?: string } = {}) {
  return {
    headers: {},
    ip: '203.0.113.10',
    method: 'GET',
    path: '/api/v1/projects',
    socket: { remoteAddress: '198.51.100.20' },
    url: '/api/v1/projects',
    ...overrides,
  } as Request;
}

describe('resolveThrottleTracker', () => {
  it('prefers a stable user id from bearer tokens outside public auth routes', () => {
    expect(resolveThrottleTracker(request({ headers: { authorization: bearer('user-1') } }))).toBe(
      'user:user-1',
    );
  });

  it('uses the IP bucket for public credential endpoints even when a bearer token is present', () => {
    expect(
      resolveThrottleTracker(
        request({
          headers: { authorization: bearer('spoofed-user') },
          method: 'POST',
          originalUrl: '/api/v1/auth/login?next=/dashboard',
          path: '/api/v1/auth/login',
        }),
      ),
    ).toBe('ip:203.0.113.10');
  });

  it('falls back to request IP for missing, malformed or empty bearer payloads', () => {
    expect(resolveThrottleTracker(request({ headers: {} }))).toBe('ip:203.0.113.10');
    expect(resolveThrottleTracker(request({ headers: { authorization: 'Bearer nope' } }))).toBe(
      'ip:203.0.113.10',
    );
    expect(
      resolveThrottleTracker(
        request({
          headers: {
            authorization: `Bearer h.${Buffer.from('{}').toString('base64url')}.s`,
          },
        }),
      ),
    ).toBe('ip:203.0.113.10');
  });

  it('normalizes route path candidates and falls back to the socket address', () => {
    expect(
      resolveThrottleTracker(
        request({
          ip: undefined,
          method: 'POST',
          originalUrl: '/api/v1/auth/password/reset/',
          path: undefined,
          url: '/fallback',
        }),
      ),
    ).toBe('ip:198.51.100.20');
  });
});
