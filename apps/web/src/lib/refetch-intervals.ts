/**
 * Centralized polling intervals for TanStack Query `refetchInterval`.
 *
 * Picked to match user perception of "live" data:
 *  - ACTIVE_AUDIT: a running audit completes within seconds; 2s feels live.
 *  - DELIVERIES: webhook deliveries are fire-and-forget; 5s is enough.
 *  - OPERATIONAL_STATUS: dashboard chrome (queue depth, exports list) — 10s.
 *  - NOTIFICATIONS: bell badge — 15s; the user opens it on demand.
 *  - SLOW_REFRESH: background "keep me fresh" for list endpoints with no
 *    active items (e.g. audit history list when nothing is running).
 *
 * Use `false` for "stop polling".
 */
export const REFETCH_INTERVALS = {
  ACTIVE_AUDIT_MS: 2_000,
  DELIVERIES_MS: 5_000,
  OPERATIONAL_STATUS_MS: 10_000,
  NOTIFICATIONS_MS: 15_000,
  SLOW_REFRESH_MS: 30_000,
} as const;

/**
 * Polling helper for `useQuery({ refetchInterval })` on a single audit run:
 * polls fast while QUEUED/RUNNING, stops once it transitions to a terminal
 * state. Pass directly:
 *
 *   refetchInterval: pollWhileAuditActive,
 */
export function pollWhileAuditActive<T extends { status?: string }>(query: {
  state: { data: T | undefined };
}): number | false {
  const status = query.state.data?.status;
  return status === 'QUEUED' || status === 'RUNNING' ? REFETCH_INTERVALS.ACTIVE_AUDIT_MS : false;
}
