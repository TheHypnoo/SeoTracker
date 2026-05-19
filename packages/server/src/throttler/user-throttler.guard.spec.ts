import { describe, expect, it } from '@jest/globals';
import type { Request } from 'express';

import { resolveThrottleTracker, UserOrIpThrottlerGuard } from './user-throttler.guard';

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

  it('falls back for empty bearer tokens, empty payload segments and invalid payload JSON', () => {
    expect(resolveThrottleTracker(request({ headers: { authorization: 'Bearer    ' } }))).toBe(
      'ip:203.0.113.10',
    );
    expect(resolveThrottleTracker(request({ headers: { authorization: 'Bearer h..s' } }))).toBe(
      'ip:203.0.113.10',
    );
    expect(
      resolveThrottleTracker(request({ headers: { authorization: 'Bearer h.bm90LWpzb24.s' } })),
    ).toBe('ip:203.0.113.10');
  });

  it('uses unknown when neither request ip nor socket remote address exists', () => {
    expect(resolveThrottleTracker(request({ ip: undefined, socket: undefined }))).toBe(
      'ip:unknown',
    );
  });

  it('normalizes empty route candidates to slash for auth route checks', () => {
    expect(
      resolveThrottleTracker(request({ method: 'POST', path: '/', originalUrl: '', url: '' })),
    ).toBe('ip:203.0.113.10');
  });

  it('delegates the Nest throttler guard tracker to the resolver', async () => {
    class ExposedGuard extends UserOrIpThrottlerGuard {
      public track(req: Request) {
        return this.getTracker(req);
      }
    }

    await expect(
      new ExposedGuard().track(request({ headers: { authorization: bearer('guard-user') } })),
    ).resolves.toBe('user:guard-user');
  });

  it('handles requests without method and path-like values without query separators', () => {
    expect(
      resolveThrottleTracker(
        request({ method: undefined, path: '/api/v1/projects', url: '/plain' }),
      ),
    ).toBe('ip:203.0.113.10');
  });
});
