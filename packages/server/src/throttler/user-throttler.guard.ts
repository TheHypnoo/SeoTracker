import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { Request } from 'express';

/**
 * Rate-limit tracker that prefers a stable per-user key over the request IP.
 *
 * Why per-user:
 *  - Multiple users behind a NAT (corporate office, mobile carrier) share an
 *    IP and would collectively trip an IP-based limit.
 *  - Cloudflare / Railway proxies can mask client IPs; getting it right
 *    requires both `trust proxy` correctly set AND the right header parsed.
 *  - Public credential endpoints are always keyed by IP so a forged Bearer
 *    token cannot rotate the login/register/password-reset bucket.
 *
 * IP fallback (for unauthenticated requests):
 *   - req.ip, derived by Express from the socket or X-Forwarded-For only when
 *     `trust proxy` is configured to the exact hop count.
 */
@Injectable()
export class UserOrIpThrottlerGuard extends ThrottlerGuard {
  protected override async getTracker(req: Request): Promise<string> {
    return resolveThrottleTracker(req);
  }
}

const IP_ONLY_AUTH_ROUTE_SUFFIXES = [
  '/auth/login',
  '/auth/register',
  '/auth/password/forgot',
  '/auth/password/reset',
];

export function resolveThrottleTracker(req: Request): string {
  const ip = pickClientIp(req);
  if (isIpOnlyAuthRoute(req)) {
    return `ip:${ip}`;
  }

  const userKey = extractUserKey(req);
  if (userKey) {
    return `user:${userKey}`;
  }

  return `ip:${ip}`;
}

function extractUserKey(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header || !header.toLowerCase().startsWith('bearer ')) {
    return null;
  }
  const token = header.slice(7).trim();
  if (!token) {
    return null;
  }

  // Decode the JWT payload without verifying the signature. We only use it
  // as a tracker key; auth guards still validate downstream. A spoofed JWT
  // simply lands in its own bucket, which is harmless.
  const parts = token.split('.');
  if (parts.length !== 3) {
    return null;
  }

  try {
    const segment = parts[1] ?? '';
    if (!segment) {
      return null;
    }
    const payloadJson = Buffer.from(segment, 'base64url').toString('utf-8');
    const payload = JSON.parse(payloadJson) as { sub?: string };
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null;
  } catch {
    return null;
  }
}

function isIpOnlyAuthRoute(req: Request): boolean {
  if ((req.method ?? '').toUpperCase() !== 'POST') {
    return false;
  }

  const candidates = requestPathCandidates(req);
  return candidates.some((path) =>
    IP_ONLY_AUTH_ROUTE_SUFFIXES.some((suffix) => path === suffix || path.endsWith(suffix)),
  );
}

function requestPathCandidates(req: Request): string[] {
  const rawValues = [
    req.path,
    (req as Request & { originalUrl?: string }).originalUrl,
    req.url,
  ].filter((value): value is string => Boolean(value));

  return rawValues.map((value) => {
    const [path = ''] = value.split('?');
    const trimmed = path.replace(/\/+$/, '');
    return trimmed || '/';
  });
}

function pickClientIp(req: Request): string {
  return req.ip ?? req.socket?.remoteAddress ?? 'unknown';
}
