import { Inject, Injectable } from '@nestjs/common';
import { AuditStatus } from '@seotracker/shared-types';
import { and, desc, eq } from 'drizzle-orm';
import type IORedis from 'ioredis';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { auditRuns, sites } from '../database/schema';
import { REDIS_CONNECTION } from '../queue/queue.constants';

const BADGE_CACHE_PREFIX = 'public-badge:svg:';
/** TTL when serving the actual score — long enough to absorb viral traffic, short enough to feel fresh. */
const BADGE_CACHE_TTL_OK_SEC = 300;
/** Shorter TTL for "off" / "pending" so toggling on (or first audit) reflects fast. */
const BADGE_CACHE_TTL_NEUTRAL_SEC = 60;

type BadgeState = 'ok' | 'disabled' | 'pending';

/**
 * Serves the public SVG badge for a site. Three states:
 *  - ok       → score pill with tone (green/amber/red)
 *  - pending  → "—" gray pill (badge enabled but no completed audit yet)
 *  - disabled → "off" gray pill (also returned for non-existent sites, to
 *               avoid leaking site existence to unauthenticated callers)
 *
 * Reads go through Redis. When the owner toggles the flag, the admin
 * service calls invalidate(siteId) so the next render reflects immediately.
 */
@Injectable()
export class PublicBadgesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(REDIS_CONNECTION) private readonly redis: IORedis,
  ) {}

  async renderSvg(siteId: string): Promise<{ svg: string }> {
    const key = BADGE_CACHE_PREFIX + siteId;

    const cached = await this.redis.get(key);
    if (cached) return { svg: cached };

    const [row] = await this.db
      .select({
        enabled: sites.publicBadgeEnabled,
        score: auditRuns.score,
      })
      .from(sites)
      .leftJoin(
        auditRuns,
        and(eq(auditRuns.siteId, sites.id), eq(auditRuns.status, AuditStatus.COMPLETED)),
      )
      .where(eq(sites.id, siteId))
      .orderBy(desc(auditRuns.createdAt))
      .limit(1);

    let svg: string;
    let ttl: number;
    if (!row || !row.enabled) {
      svg = buildSvg('disabled');
      ttl = BADGE_CACHE_TTL_NEUTRAL_SEC;
    } else if (row.score === null || row.score === undefined) {
      svg = buildSvg('pending');
      ttl = BADGE_CACHE_TTL_NEUTRAL_SEC;
    } else {
      svg = buildSvg('ok', row.score);
      ttl = BADGE_CACHE_TTL_OK_SEC;
    }

    await this.redis.set(key, svg, 'EX', ttl);
    return { svg };
  }

  async invalidate(siteId: string): Promise<void> {
    await this.redis.del(BADGE_CACHE_PREFIX + siteId);
  }
}

/** Pure helper: build the SVG string. Exported for unit tests. */
export function buildSvg(state: BadgeState, score?: number): string {
  const value = state === 'ok' ? String(score ?? 0) : state === 'pending' ? '—' : 'off';
  const tone = badgeTone(state, score);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="20" viewBox="0 0 80 20" role="img" aria-label="SEO score">',
    '  <title>SEO score</title>',
    '  <linearGradient id="b" x2="0" y2="100%">',
    '    <stop offset="0" stop-color="#fff" stop-opacity=".7"/>',
    '    <stop offset="1" stop-opacity=".1"/>',
    '  </linearGradient>',
    '  <rect rx="3" width="80" height="20" fill="#555"/>',
    `  <rect rx="3" x="40" width="40" height="20" fill="${tone}"/>`,
    '  <rect rx="3" width="80" height="20" fill="url(#b)"/>',
    '  <g fill="#fff" text-anchor="middle" font-family="Verdana,DejaVu Sans,Geneva,sans-serif" font-size="11">',
    '    <text x="20" y="14">SEO</text>',
    `    <text x="60" y="14">${escapeXml(value)}</text>`,
    '  </g>',
    '</svg>',
  ].join('\n');
}

function badgeTone(state: BadgeState, score?: number): string {
  if (state === 'disabled' || state === 'pending' || score === undefined) return '#94a3b8';
  if (score >= 80) return '#10b981';
  if (score >= 50) return '#f59e0b';
  return '#ef4444';
}

function escapeXml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&':
        return '&amp;';
      case '<':
        return '&lt;';
      case '>':
        return '&gt;';
      case '"':
        return '&quot;';
      default:
        return '&apos;';
    }
  });
}
