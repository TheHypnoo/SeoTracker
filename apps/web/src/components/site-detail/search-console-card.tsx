import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArrowRight, BarChart3, MousePointerClick, Search, Target, TrendingUp } from 'lucide-react';

import { Badge } from '#/components/badge';
import { Skeleton } from '#/components/skeleton';
import {
  defaultDateRange,
  formatNumber,
  formatPercent,
  formatPosition,
  rangeParams,
} from '#/components/search-console/format';
import type { CandidatesResponse, PerformanceSummary } from '#/components/search-console/types';
import { useAuth } from '#/lib/auth-context';
import { formatSearchConsoleProperty } from '#/lib/search-console-format';

/**
 * Compact Search Console entry point on the site detail page. Shows linked status plus a glance of
 * the headline metrics; the full analytics live in the dedicated `/sites/:id/search` section.
 */
export function SearchConsoleCard({ siteId }: { siteId: string }) {
  const auth = useAuth();
  const { defaultStartDate, defaultEndDate } = defaultDateRange();

  const candidates = useQuery({
    queryKey: ['search-console-candidates', siteId],
    queryFn: () => auth.api.get<CandidatesResponse>(`/sites/${siteId}/search-console/candidates`),
    enabled: Boolean(auth.accessToken && siteId),
  });

  const linked = candidates.data?.linked ?? null;

  const summary = useQuery({
    queryKey: ['search-console-summary', siteId, defaultStartDate, defaultEndDate],
    queryFn: () =>
      auth.api.get<PerformanceSummary>(
        `/sites/${siteId}/search-console/performance/summary?${rangeParams(defaultStartDate, defaultEndDate)}`,
      ),
    enabled: Boolean(auth.accessToken && siteId && linked),
  });

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Search size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-950">
              Google Search Console
            </h2>
            <p className="text-xs leading-5 text-slate-500">
              Rendimiento orgánico por consulta, URL, país y dispositivo.
            </p>
          </div>
          <Badge tone={linked ? 'success' : 'neutral'}>
            {linked ? 'Vinculado' : 'Sin vincular'}
          </Badge>
        </div>
        <Link
          to="/sites/$id/search"
          params={{ id: siteId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-200 hover:bg-brand-subtle focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          {linked ? 'Ver Search Console' : 'Vincular propiedad'}
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {candidates.isLoading ? (
        <Skeleton className="mt-4 h-20 w-full" />
      ) : linked ? (
        <div className="mt-4 space-y-3">
          <div className="text-xs text-slate-500">
            <span className="font-semibold text-slate-700">
              {formatSearchConsoleProperty(linked.property.siteUrl).primary}
            </span>{' '}
            · últimos 28 días
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <CompactMetric
              label="Clicks"
              value={formatNumber(summary.data?.clicks ?? 0)}
              icon={<MousePointerClick size={13} aria-hidden="true" />}
            />
            <CompactMetric
              label="Impresiones"
              value={formatNumber(summary.data?.impressions ?? 0)}
              icon={<TrendingUp size={13} aria-hidden="true" />}
            />
            <CompactMetric
              label="CTR"
              value={formatPercent(summary.data?.ctr ?? 0)}
              icon={<Target size={13} aria-hidden="true" />}
            />
            <CompactMetric
              label="Posición"
              value={formatPosition(summary.data?.position ?? 0)}
              icon={<BarChart3 size={13} aria-hidden="true" />}
            />
          </div>
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Vincula una propiedad de Search Console para ver el rendimiento orgánico de este dominio.
        </p>
      )}
    </section>
  );
}

function CompactMetric({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <span className="text-brand-600">{icon}</span>
        {label}
      </div>
      <div className="mt-1 text-xl font-black tabular-nums text-slate-950">{value}</div>
    </div>
  );
}
