import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type {
  EngineHealthSummary,
  EngineHealthTimeseriesPoint,
  EngineModelVersionStats,
} from '@seotracker/shared-types';

import { useAuth } from '#/lib/auth-context';
import { daysAgo } from '#/components/search-console/format';

/**
 * Centralizes every engine-health query for a site (summary, time series, model-version
 * comparison) behind a single date window. All three share the same `from`/`to` so cache
 * keys stay coherent and a window change refetches them together. Consumes the
 * `/sites/:id/audits/engine-health*` endpoints.
 */
export function useEngineHealth(siteId: string, rangeDays: number, allowed = true) {
  const auth = useAuth();
  const from = daysAgo(rangeDays);
  const to = daysAgo(0);
  const enabled = Boolean(auth.accessToken && siteId && allowed);
  const params = `from=${from}&to=${to}`;

  const summary = useQuery({
    queryKey: ['engine-health-summary', siteId, from, to],
    queryFn: () =>
      auth.api.get<EngineHealthSummary>(`/sites/${siteId}/audits/engine-health?${params}`),
    enabled,
    placeholderData: keepPreviousData,
  });

  const timeseries = useQuery({
    queryKey: ['engine-health-timeseries', siteId, from, to],
    queryFn: () =>
      auth.api.get<EngineHealthTimeseriesPoint[]>(
        `/sites/${siteId}/audits/engine-health/timeseries?${params}`,
      ),
    enabled,
    placeholderData: keepPreviousData,
  });

  const modelVersions = useQuery({
    queryKey: ['engine-health-model-versions', siteId, from, to],
    queryFn: () =>
      auth.api.get<EngineModelVersionStats[]>(
        `/sites/${siteId}/audits/engine-health/model-versions?${params}`,
      ),
    enabled,
    placeholderData: keepPreviousData,
  });

  return { summary, timeseries, modelVersions, from, to };
}
