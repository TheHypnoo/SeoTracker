import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

import { useToast } from '#/components/toast';
import { useAuth } from '#/lib/auth-context';

import { type ComparisonMode, comparisonRange, defaultDateRange, rangeParams } from './format';
import type {
  BrandSplit,
  CandidatesResponse,
  CannibalizationGroup,
  DecayRow,
  ImportResponse,
  OpportunityRow,
  PerformanceSummary,
  TimeseriesPoint,
  TopPerformanceRow,
  TrackedKeyword,
} from './types';

function loadBrandTerms(siteId: string) {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(`gsc-brand-terms-${siteId}`) ?? '';
}

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
  const [brandTerms, setBrandTermsState] = useState(() => loadBrandTerms(siteId));
  const setBrandTerms = (value: string) => {
    setBrandTermsState(value);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(`gsc-brand-terms-${siteId}`, value);
    }
  };
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
    comparison,
  ] as const;
  const topPagesKey = [
    'search-console-top-pages',
    siteId,
    startDate,
    endDate,
    topLimit,
    comparison,
  ] as const;
  const topCountriesKey = [
    'search-console-top-countries',
    siteId,
    startDate,
    endDate,
    topLimit,
    comparison,
  ] as const;
  const topDevicesKey = [
    'search-console-top-devices',
    siteId,
    startDate,
    endDate,
    topLimit,
    comparison,
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
  const compareSuffix = previousRange
    ? `&compareStartDate=${previousRange.startDate}&compareEndDate=${previousRange.endDate}`
    : '';
  const topUrl = (path: string) =>
    `/sites/${siteId}/search-console/performance/${path}?${rangeParams(startDate, endDate)}&limit=${topLimit}${compareSuffix}`;

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

  const opportunities = useQuery({
    queryKey: ['search-console-opportunities', siteId, startDate, endDate, topLimit] as const,
    queryFn: () => auth.api.get<OpportunityRow[]>(topUrl('opportunities')),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const cannibalization = useQuery({
    queryKey: ['search-console-cannibalization', siteId, startDate, endDate, topLimit] as const,
    queryFn: () => auth.api.get<CannibalizationGroup[]>(topUrl('cannibalization')),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const decay = useQuery({
    queryKey: ['search-console-decay', siteId, startDate, endDate, topLimit] as const,
    queryFn: () => auth.api.get<DecayRow[]>(topUrl('decay')),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const brandSplit = useQuery({
    queryKey: ['search-console-brand', siteId, startDate, endDate, brandTerms] as const,
    queryFn: () =>
      auth.api.get<BrandSplit>(
        `/sites/${siteId}/search-console/performance/brand-split?${rangeParams(
          startDate,
          endDate,
        )}&brandTerms=${encodeURIComponent(brandTerms)}`,
      ),
    enabled: topEnabled && brandTerms.trim().length > 0,
    placeholderData: keepPreviousData,
  });

  const trackedKeywords = useQuery({
    queryKey: ['search-console-keywords', siteId, startDate, endDate] as const,
    queryFn: () =>
      auth.api.get<TrackedKeyword[]>(
        `/sites/${siteId}/search-console/keywords?${rangeParams(startDate, endDate)}`,
      ),
    enabled: topEnabled,
    placeholderData: keepPreviousData,
  });

  const trackKeyword = useMutation({
    mutationFn: (query: string) =>
      auth.api.post(`/sites/${siteId}/search-console/keywords`, { query }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['search-console-keywords', siteId] });
    },
  });

  const untrackKeyword = useMutation({
    mutationFn: (query: string) =>
      auth.api.delete(
        `/sites/${siteId}/search-console/keywords?query=${encodeURIComponent(query)}`,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['search-console-keywords', siteId] });
    },
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

  // Invalidate every derived Search Console query for this site (summary, timeseries, top lists,
  // opportunities, cannibalization, decay, brand split, tracked keywords) so a manual import
  // refreshes the whole section, not just the headline metrics.
  const invalidatePerformance = () =>
    queryClient.invalidateQueries({
      predicate: (query) => {
        const [name, keySiteId] = query.queryKey as [unknown, unknown];
        return (
          typeof name === 'string' && name.startsWith('search-console-') && keySiteId === siteId
        );
      },
    });

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
    brandSplit,
    brandTerms,
    candidates,
    cannibalization,
    comparison,
    decay,
    endDate,
    setBrandTerms,
    trackKeyword,
    trackedKeywords,
    untrackKeyword,
    hasLink,
    importPerformance,
    linked,
    linkProperty,
    opportunities,
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
