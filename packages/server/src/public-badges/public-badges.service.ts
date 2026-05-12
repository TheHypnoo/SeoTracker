import { Inject, Injectable } from '@nestjs/common';
import { AuditStatus } from '@seotracker/shared-types';
import { and, desc, eq } from 'drizzle-orm';
import type IORedis from 'ioredis';

import { DRIZZLE } from '../database/database.constants';
import type { Db } from '../database/database.types';
import { auditRuns, sites } from '../database/schema';
import { REDIS_CONNECTION } from '../queue/queue.constants';

const BADGE_CACHE_PREFIX = 'public-badge:official:svg:';
const LEGACY_BADGE_CACHE_PREFIXES = ['public-badge:svg:', 'public-badge:v2:svg:'];
const BADGE_WIDTH = 168;
const BADGE_HEIGHT = 28;
const BRAND_WIDTH = 112;
const VALUE_WIDTH = BADGE_WIDTH - BRAND_WIDTH;
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

    const cached = await this.redis.get(key).catch(() => null);
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

    await this.redis.set(key, svg, 'EX', ttl).catch(() => undefined);
    return { svg };
  }

  async invalidate(siteId: string): Promise<void> {
    await Promise.all([
      this.redis.del(BADGE_CACHE_PREFIX + siteId).catch(() => undefined),
      ...LEGACY_BADGE_CACHE_PREFIXES.map((prefix) =>
        this.redis.del(prefix + siteId).catch(() => undefined),
      ),
    ]);
  }
}

/** Pure helper: build the SVG string. Exported for unit tests. */
export function buildSvg(state: BadgeState, score?: number): string {
  const value = state === 'ok' ? `${score ?? 0}/100` : state === 'pending' ? 'pending' : 'off';
  const tone = badgeTone(state, score);
  const scoreTextColor = state === 'ok' || state === 'pending' ? '#ffffff' : '#e2e8f0';
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" viewBox="0 0 ${BADGE_WIDTH} ${BADGE_HEIGHT}" role="img" aria-label="SEOTracker score">`,
    '  <title>SEOTracker score</title>',
    '  <defs>',
    '    <clipPath id="badge-r"><rect width="168" height="28" rx="7"/></clipPath>',
    '    <linearGradient id="brand-bg" x1="0" x2="1" y1="0" y2="1">',
    '      <stop offset="0" stop-color="#0f172a"/>',
    '      <stop offset="1" stop-color="#1e293b"/>',
    '    </linearGradient>',
    '    <linearGradient id="shine" x1="0" x2="0" y1="0" y2="1">',
    '      <stop offset="0" stop-color="#ffffff" stop-opacity=".18"/>',
    '      <stop offset="1" stop-color="#ffffff" stop-opacity="0"/>',
    '    </linearGradient>',
    '  </defs>',
    '  <g clip-path="url(#badge-r)">',
    `    <rect width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" fill="url(#brand-bg)"/>`,
    '    <rect width="4" height="28" fill="#38bdf8"/>',
    '    <circle cx="16" cy="14" r="6" fill="#0ea5e9"/>',
    '    <path d="M13 14.5l2 2 4-5" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>',
    `    <rect x="${BRAND_WIDTH}" width="${VALUE_WIDTH}" height="${BADGE_HEIGHT}" fill="${tone}"/>`,
    `    <rect width="${BADGE_WIDTH}" height="${BADGE_HEIGHT}" fill="url(#shine)"/>`,
    '  </g>',
    '  <rect x=".5" y=".5" width="167" height="27" rx="6.5" fill="none" stroke="#ffffff" stroke-opacity=".16"/>',
    '  <g font-family="Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif" text-anchor="middle">',
    '    <text x="67" y="18" fill="#ffffff" font-size="12" font-weight="700" letter-spacing=".2">SEOTracker</text>',
    `    <text x="${BRAND_WIDTH + VALUE_WIDTH / 2}" y="18" fill="${scoreTextColor}" font-size="11" font-weight="800">${escapeXml(value)}</text>`,
    '  </g>',
    '</svg>',
  ].join('\n');
}

function badgeTone(state: BadgeState, score?: number): string {
  if (state === 'disabled') return '#475569';
  if (state === 'pending' || score === undefined) return '#64748b';
  if (score >= 80) return '#059669';
  if (score >= 50) return '#d97706';
  return '#dc2626';
}

function escapeXml(s: string): string {
  return s.replaceAll(/[&<>"']/g, (c) => {
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
