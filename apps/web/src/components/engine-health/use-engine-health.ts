import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  EngineHealthSummary,
  EngineHealthTimeseriesPoint,
  EngineModelVersionStats,
} from '@seotracker/shared-types';

import { useAuth } from '#/lib/auth-context';
import { daysAgo } from '#/components/search-console/format';

export type EngineHealthFilters = {
  siteId?: string;
  projectId?: string;
};

/**
 * Centralizes every engine-health query (summary, time series, model-version
 * comparison) behind a single date window. By default it reads platform-wide
 * telemetry; optional filters narrow the same dashboard to a project or site.
 */
export function useEngineHealth(
  rangeDays: number,
  allowed = true,
  filters: EngineHealthFilters = {},
) {
  const auth = useAuth();
  const from = daysAgo(rangeDays);
  const to = daysAgo(0);
  const enabled = Boolean(auth.user && allowed);
  const params = buildEngineHealthParams({ ...filters, from, to });
  const queryScope = {
    projectId: filters.projectId ?? null,
    siteId: filters.siteId ?? null,
  };

  const summary = useQuery({
    queryKey: ['engine-health-summary', queryScope, from, to],
    queryFn: () => auth.api.get<EngineHealthSummary>(`/engine-health?${params}`),
    enabled,
    placeholderData: keepPreviousData,
  });

  const timeseries = useQuery({
    queryKey: ['engine-health-timeseries', queryScope, from, to],
    queryFn: () =>
      auth.api.get<EngineHealthTimeseriesPoint[]>(`/engine-health/timeseries?${params}`),
    enabled,
    placeholderData: keepPreviousData,
  });

  const modelVersions = useQuery({
    queryKey: ['engine-health-model-versions', queryScope, from, to],
    queryFn: () =>
      auth.api.get<EngineModelVersionStats[]>(`/engine-health/model-versions?${params}`),
    enabled,
    placeholderData: keepPreviousData,
  });

  return { summary, timeseries, modelVersions, from, to };
}

export function buildEngineHealthParams(input: EngineHealthFilters & { from: string; to: string }) {
  const params = new URLSearchParams({ from: input.from, to: input.to });
  if (input.siteId) params.set('siteId', input.siteId);
  if (input.projectId) params.set('projectId', input.projectId);
  return params.toString();
}
