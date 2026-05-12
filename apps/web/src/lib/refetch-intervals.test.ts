import { describe, expect, it } from 'vitest';

import {
  REFETCH_INTERVALS,
  pollWhileAnyAuditActive,
  pollWhileAnyLatestAuditActive,
  pollWhileAuditActive,
  rateLimitCooldownMs,
} from './refetch-intervals';

describe('refetch intervals', () => {
  it('polls a single active audit and stops on terminal status', () => {
    expect(pollWhileAuditActive({ state: { data: { status: 'QUEUED' } } })).toBe(
      REFETCH_INTERVALS.ACTIVE_AUDIT_MS,
    );
    expect(pollWhileAuditActive({ state: { data: { status: 'RUNNING' } } })).toBe(
      REFETCH_INTERVALS.ACTIVE_AUDIT_MS,
    );
    expect(pollWhileAuditActive({ state: { data: { status: 'COMPLETED' } } })).toBeFalsy();
  });

  it('polls lists slowly unless an audit is active', () => {
    expect(
      pollWhileAnyAuditActive({
        state: { data: { items: [{ status: 'COMPLETED' }, { status: 'FAILED' }] } },
      }),
    ).toBe(REFETCH_INTERVALS.SLOW_REFRESH_MS);

    expect(
      pollWhileAnyAuditActive({
        state: { data: { items: [{ status: 'COMPLETED' }, { status: 'RUNNING' }] } },
      }),
    ).toBe(REFETCH_INTERVALS.ACTIVE_AUDIT_MS);
  });

  it('detects active latest audit statuses on site lists', () => {
    expect(
      pollWhileAnyLatestAuditActive({
        state: { data: { items: [{ latestAuditStatus: null }, { latestAuditStatus: 'QUEUED' }] } },
      }),
    ).toBe(REFETCH_INTERVALS.ACTIVE_AUDIT_MS);
  });

  it('backs off polling after rate limits', () => {
    expect(rateLimitCooldownMs({ status: 429, retryAfterMs: 5_000 })).toBe(
      REFETCH_INTERVALS.RATE_LIMIT_COOLDOWN_MS,
    );
    expect(rateLimitCooldownMs({ isRateLimited: true, retryAfterMs: 45_000 })).toBe(45_000);

    expect(
      pollWhileAnyAuditActive({
        state: {
          data: { items: [{ status: 'RUNNING' }] },
          error: { status: 429, retryAfterMs: 5_000 },
        },
      }),
    ).toBe(REFETCH_INTERVALS.RATE_LIMIT_COOLDOWN_MS);
  });
});
