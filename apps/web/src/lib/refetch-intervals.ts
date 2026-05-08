/**
 * Centralized polling intervals for TanStack Query `refetchInterval`.
 *
 * Picked to match user perception of "live" data:
 *  - ACTIVE_AUDIT: a running audit completes within seconds; 5s keeps the UI
 *    current without racing the API throttler when several panels are open.
 *  - DELIVERIES: webhook deliveries are fire-and-forget; 5s is enough.
 *  - OPERATIONAL_STATUS: dashboard chrome (queue depth, exports list) — 10s.
 *  - NOTIFICATIONS: bell badge — 15s; the user opens it on demand.
 *  - SLOW_REFRESH: background "keep me fresh" for list endpoints with no
 *    active items (e.g. audit history list when nothing is running).
 *
 * Use `false` for "stop polling".
 */
export const REFETCH_INTERVALS = {
  ACTIVE_AUDIT_MS: 5_000,
  DELIVERIES_MS: 5_000,
  OPERATIONAL_STATUS_MS: 10_000,
  NOTIFICATIONS_MS: 15_000,
  RATE_LIMIT_COOLDOWN_MS: 15_000,
  SLOW_REFRESH_MS: 30_000,
} as const;

type PollingQuery<T> = {
  state: {
    data: T | undefined;
    error?: unknown;
  };
};

type RateLimitLike = {
  isRateLimited?: boolean;
  retryAfterMs?: number;
  status?: number;
};

export function isActiveAuditStatus(status: string | null | undefined): boolean {
  return status === 'QUEUED' || status === 'RUNNING';
}

export function rateLimitCooldownMs(error: unknown): number | false {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as RateLimitLike;
  if (candidate.isRateLimited !== true && candidate.status !== 429) {
    return false;
  }

  return Math.max(candidate.retryAfterMs ?? 0, REFETCH_INTERVALS.RATE_LIMIT_COOLDOWN_MS);
}

export function pollWhileAnyAuditActive<T extends { status?: string }>(query: {
  state: {
    data: { items?: T[] } | undefined;
    error?: unknown;
  };
}): number | false {
  const rateLimitDelay = rateLimitCooldownMs(query.state.error);
  if (rateLimitDelay) {
    return rateLimitDelay;
  }

  const items = query.state.data?.items ?? [];
  const hasActive = items.some((item) => isActiveAuditStatus(item.status));
  return hasActive ? REFETCH_INTERVALS.ACTIVE_AUDIT_MS : REFETCH_INTERVALS.SLOW_REFRESH_MS;
}

export function pollWhileAnyLatestAuditActive<T extends { latestAuditStatus?: string | null }>(
  query: {
    state: {
      data: { items?: T[] } | undefined;
      error?: unknown;
    };
  },
): number | false {
  const rateLimitDelay = rateLimitCooldownMs(query.state.error);
  if (rateLimitDelay) {
    return rateLimitDelay;
  }

  const items = query.state.data?.items ?? [];
  const hasActive = items.some((item) => isActiveAuditStatus(item.latestAuditStatus));
  return hasActive ? REFETCH_INTERVALS.ACTIVE_AUDIT_MS : REFETCH_INTERVALS.SLOW_REFRESH_MS;
}

/**
 * Polling helper for `useQuery({ refetchInterval })` on a single audit run:
 * polls fast while QUEUED/RUNNING, stops once it transitions to a terminal
 * state. Pass directly:
 *
 *   refetchInterval: pollWhileAuditActive,
 */
export function pollWhileAuditActive<T extends { status?: string }>(
  query: PollingQuery<T>,
): number | false {
  const rateLimitDelay = rateLimitCooldownMs(query.state.error);
  if (rateLimitDelay) {
    return rateLimitDelay;
  }

  const status = query.state.data?.status;
  return isActiveAuditStatus(status) ? REFETCH_INTERVALS.ACTIVE_AUDIT_MS : false;
}
