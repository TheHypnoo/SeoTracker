import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useToast } from '#/components/toast';
import { useAuth } from '#/lib/auth-context';

import { type ComparisonMode, comparisonRange, defaultDateRange, rangeParams } from './format';
import type {
  CandidatesResponse,
  ImportResponse,
  PerformanceSummary,
  TimeseriesPoint,
  TopPerformanceRow,
} from './types';

/**
 * Encapsulates every Search Console query and mutation for a site: candidate/linked property,
 * the performance summary and the four top-dimension lists, plus link/unlink/import actions.
 * The date range and the selected (not-yet-linked) property live here so any consumer — the
 * dedicated section or a compact site-detail card — shares the same cache keys.
 */
export function useSearchConsole(siteId: string, options: { topLimit?: number } = {}) {
  const topLimit = options.topLimit ?? 25;
  const auth = useAuth();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [selectedPropertyId, setSelectedPropertyId] = useState('');
  const [comparison, setComparison] = useState<ComparisonMode>('none');
  const { defaultStartDate, defaultEndDate } = useMemo(() => defaultDateRange(), []);
  const [startDate, setStartDate] = useState(defaultStartDate);
  const [endDate, setEndDate] = useState(defaultEndDate);

  const previousRange =
    comparison === 'none' ? null : comparisonRange(startDate, endDate, comparison);

  const candidatesKey = ['search-console-candidates', siteId] as const;
  const summaryKey = ['search-console-summary', siteId, startDate, endDate] as const;
  const topQueriesKey = [
    'search-console-top-queries',
    siteId,
    startDate,
    endDate,
    topLimit,
  ] as const;
  const topPagesKey = ['search-console-top-pages', siteId, startDate, endDate, topLimit] as const;
  const topCountriesKey = [
    'search-console-top-countries',
    siteId,
    startDate,
    endDate,
    topLimit,
  ] as const;
  const topDevicesKey = [
    'search-console-top-devices',
    siteId,
    startDate,
    endDate,
    topLimit,
  ] as const;

  const enabled = Boolean(auth.accessToken && siteId);

  const candidates = useQuery({
    queryKey: candidatesKey,
    queryFn: () => auth.api.get<CandidatesResponse>(`/sites/${siteId}/search-console/candidates`),
    enabled,
  });

  const linked = candidates.data?.linked ?? null;
  const hasLink = Boolean(linked);
  const recommendedId = candidates.data?.recommendedPropertyId ?? '';
  const firstCandidateId = candidates.data?.properties[0]?.id ?? '';
  const activePropertyId = selectedPropertyId || recommendedId || firstCandidateId;
  const topEnabled = enabled && hasLink;
  const topUrl = (path: string) =>
    `/sites/${siteId}/search-console/performance/${path}?${rangeParams(startDate, endDate)}&limit=${topLimit}`;

  const summary = useQuery({
    queryKey: summaryKey,
    queryFn: () =>
      auth.api.get<PerformanceSummary>(
        `/sites/${siteId}/search-console/performance/summary?${rangeParams(startDate, endDate)}`,
      ),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const topQueries = useQuery({
    queryKey: topQueriesKey,
    queryFn: () => auth.api.get<TopPerformanceRow[]>(topUrl('top-queries')),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const topPages = useQuery({
    queryKey: topPagesKey,
    queryFn: () => auth.api.get<TopPerformanceRow[]>(topUrl('top-pages')),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const topCountries = useQuery({
    queryKey: topCountriesKey,
    queryFn: () => auth.api.get<TopPerformanceRow[]>(topUrl('top-countries')),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const topDevices = useQuery({
    queryKey: topDevicesKey,
    queryFn: () => auth.api.get<TopPerformanceRow[]>(topUrl('top-devices')),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const timeseries = useQuery({
    queryKey: ['search-console-timeseries', siteId, startDate, endDate] as const,
    queryFn: () =>
      auth.api.get<TimeseriesPoint[]>(
        `/sites/${siteId}/search-console/performance/timeseries?${rangeParams(startDate, endDate)}`,
      ),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  // Previous-period summary used to render delta badges. Built by re-querying the existing
  // summary endpoint over the comparison range rather than widening the backend response.
  const previousSummary = useQuery({
    queryKey: ['search-console-summary', siteId, previousRange?.startDate, previousRange?.endDate],
    queryFn: () =>
      auth.api.get<PerformanceSummary>(
        `/sites/${siteId}/search-console/performance/summary?${rangeParams(
          previousRange?.startDate ?? startDate,
          previousRange?.endDate ?? endDate,
        )}`,
      ),
    enabled: topEnabled && previousRange !== null,
    placeholderData: keepPreviousData,
  });

  const invalidatePerformance = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['search-console-summary', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['search-console-top-queries', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['search-console-top-pages', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['search-console-top-countries', siteId] }),
      queryClient.invalidateQueries({ queryKey: ['search-console-top-devices', siteId] }),
    ]);

  const linkProperty = useMutation({
    mutationFn: (searchConsolePropertyId: string) =>
      auth.api.post(`/sites/${siteId}/search-console/link`, { searchConsolePropertyId }),
    onSuccess: async () => {
      toast.success('Propiedad vinculada', 'Importando el histórico de Search Console…');
      await queryClient.invalidateQueries({ queryKey: candidatesKey });
    },
  });

  const unlinkProperty = useMutation({
    mutationFn: () => auth.api.delete(`/sites/${siteId}/search-console/link`),
    onSuccess: async () => {
      toast.success('Propiedad desvinculada');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: candidatesKey }),
        invalidatePerformance(),
      ]);
    },
  });

  const importPerformance = useMutation({
    mutationFn: () =>
      auth.api.post<ImportResponse>(`/sites/${siteId}/search-console/performance/import`, {
        endDate,
        startDate,
      }),
    onSuccess: async (result) => {
      toast.success('Datos importados', `${result.importedRows} filas actualizadas.`);
      await invalidatePerformance();
    },
    onError: (error) => {
      toast.error(
        'No se pudo importar GSC',
        error instanceof Error ? error.message : 'Revisa la conexión con Google Search Console.',
      );
    },
  });

  const refreshing =
    summary.isFetching ||
    topQueries.isFetching ||
    topPages.isFetching ||
    topCountries.isFetching ||
    topDevices.isFetching;

  return {
    activePropertyId,
    candidates,
    comparison,
    endDate,
    hasLink,
    importPerformance,
    linked,
    linkProperty,
    previousRange,
    previousSummary,
    refreshing,
    selectedPropertyId,
    setComparison,
    setEndDate,
    setSelectedPropertyId,
    setStartDate,
    startDate,
    summary,
    timeseries,
    topCountries,
    topDevices,
    topPages,
    topQueries,
    unlinkProperty,
  };
}
