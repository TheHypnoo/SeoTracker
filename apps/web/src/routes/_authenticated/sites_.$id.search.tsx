import { Link, createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  ArrowLeft,
  BarChart3,
  CalendarDays,
  DatabaseZap,
  Globe2,
  MousePointerClick,
  Search,
  Target,
  TrendingUp,
} from 'lucide-react';
import { useState } from 'react';

import { Badge } from '#/components/badge';
import { Button } from '#/components/button';
import { ClicksImpressionsChart } from '#/components/charts/clicks-impressions-chart';
import { Notice } from '#/components/notice';
import { QueryState } from '#/components/query-state';
import { DeltaBadge } from '#/components/search-console/delta-badge';
import {
  DateRangePickerButton,
  RANGE_PRESETS,
} from '#/components/search-console/date-range-picker';
import {
  type ComparisonMode,
  CountryFlag,
  DeviceIcon,
  daysAgo,
  daysBefore,
  formatCountry,
  formatDevice,
  formatNumber,
  formatPercent,
  formatPosition,
  isDateOnly,
} from '#/components/search-console/format';
import {
  ConfirmUnlinkButton,
  LinkedPropertyBanner,
  PropertyLinkPanel,
} from '#/components/search-console/property-panels';
import { CannibalizationGroups } from '#/components/search-console/cannibalization-groups';
import { OpportunitiesTable } from '#/components/search-console/opportunities-table';
import { MetricCard, TopList } from '#/components/search-console/top-list';
import { useSearchConsole } from '#/components/search-console/use-search-console';
import { useAuth } from '#/lib/auth-context';

export const Route = createFileRoute('/_authenticated/sites_/$id/search')({
  component: SiteSearchConsolePage,
});

type Site = { id: string; name: string; domain: string; projectId: string };

type SearchTab =
  | 'overview'
  | 'queries'
  | 'pages'
  | 'opportunities'
  | 'cannibalization'
  | 'audience';

const SEARCH_TABS: Array<{ id: SearchTab; label: string }> = [
  { id: 'overview', label: 'Resumen' },
  { id: 'queries', label: 'Consultas' },
  { id: 'pages', label: 'Páginas' },
  { id: 'opportunities', label: 'Oportunidades' },
  { id: 'cannibalization', label: 'Canibalización' },
  { id: 'audience', label: 'Audiencia' },
];

const CANDIDATES_LOADING = (
  <div className="space-y-3">
    <div className="h-24 w-full animate-pulse rounded-2xl bg-slate-100" />
    <div className="h-40 w-full animate-pulse rounded-2xl bg-slate-100" />
  </div>
);

function SiteSearchConsolePage() {
  const { id } = Route.useParams();
  const auth = useAuth();
  const [tab, setTab] = useState<SearchTab>('overview');

  const site = useQuery({
    queryKey: ['site', id],
    queryFn: () => auth.api.get<Site>(`/sites/${id}`),
    enabled: Boolean(auth.accessToken),
  });

  const gsc = useSearchConsole(id, { topLimit: 25 });

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <Link
            to="/sites/$id"
            params={{ id }}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-brand-700"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Volver al dominio
          </Link>
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Search Console
          </div>
          <h1 className="mt-1 flex flex-wrap items-center gap-3 text-3xl font-bold tracking-tight text-slate-950">
            {site.data?.name ?? 'Cargando...'}
            <Badge tone={gsc.hasLink ? 'success' : 'neutral'}>
              {gsc.hasLink ? 'Vinculado' : 'Sin vincular'}
            </Badge>
          </h1>
          <div className="mt-0.5 font-mono text-sm text-slate-500">{site.data?.domain ?? '—'}</div>
        </div>
        {gsc.hasLink ? (
          <ConfirmUnlinkButton
            loading={gsc.unlinkProperty.isPending}
            onClick={() => gsc.unlinkProperty.mutate()}
          />
        ) : null}
      </header>

      <QueryState
        status={gsc.candidates.status}
        data={gsc.candidates.data}
        error={gsc.candidates.error}
        onRetry={() => gsc.candidates.refetch()}
        loading={CANDIDATES_LOADING}
      >
        {(data) =>
          data.linked ? (
            <div className="space-y-5">
              <LinkedPropertyBanner linked={data.linked} />
              <PeriodControls
                startDate={gsc.startDate}
                endDate={gsc.endDate}
                refreshing={gsc.refreshing}
                importPending={gsc.importPerformance.isPending}
                comparison={gsc.comparison}
                onComparisonChange={gsc.setComparison}
                onApplyRange={(range) => {
                  gsc.setStartDate(range.startDate);
                  gsc.setEndDate(range.endDate);
                }}
                onImport={() => gsc.importPerformance.mutate()}
              />
              <TabNav tab={tab} onChange={setTab} />
              <TabPanels tab={tab} gsc={gsc} />
            </div>
          ) : data.properties.length > 0 ? (
            <PropertyLinkPanel
              data={data}
              activePropertyId={gsc.activePropertyId}
              selectedPropertyId={gsc.selectedPropertyId}
              onSelectProperty={gsc.setSelectedPropertyId}
              linkPending={gsc.linkProperty.isPending}
              onLink={(propertyId) => gsc.linkProperty.mutate(propertyId)}
            />
          ) : (
            <Notice tone="warning">
              No hay propiedades sincronizadas para este proyecto. Ve a Configuración &gt;
              Integraciones, conecta Google y pulsa “Sincronizar”.
            </Notice>
          )
        }
      </QueryState>
    </section>
  );
}

const COMPARISON_OPTIONS: Array<{ id: ComparisonMode; label: string }> = [
  { id: 'none', label: 'Sin comparar' },
  { id: 'previous', label: 'Periodo anterior' },
  { id: 'yoy', label: 'Año anterior' },
];

function PeriodControls({
  startDate,
  endDate,
  refreshing,
  importPending,
  comparison,
  onComparisonChange,
  onApplyRange,
  onImport,
}: {
  startDate: string;
  endDate: string;
  refreshing: boolean;
  importPending: boolean;
  comparison: ComparisonMode;
  onComparisonChange: (mode: ComparisonMode) => void;
  onApplyRange: (range: { startDate: string; endDate: string }) => void;
  onImport: () => void;
}) {
  const dateRangeValid = isDateOnly(startDate) && isDateOnly(endDate) && startDate <= endDate;
  const activePreset = RANGE_PRESETS.find(
    (preset) => endDate === daysAgo(3) && startDate === daysBefore(endDate, preset.days - 1),
  );

  const setPresetRange = (days: number) => {
    const presetEndDate = daysAgo(3);
    onApplyRange({ endDate: presetEndDate, startDate: daysBefore(presetEndDate, days - 1) });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} className="text-brand-500" aria-hidden="true" />
          <h2 className="text-sm font-bold text-slate-950">Periodo de análisis</h2>
          {refreshing ? <Badge tone="neutral">Actualizando</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {RANGE_PRESETS.map((preset) => (
            <button
              type="button"
              key={preset.days}
              onClick={() => setPresetRange(preset.days)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold transition ${
                activePreset?.days === preset.days
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,18rem)_auto] sm:items-end">
          <DateRangePickerButton startDate={startDate} endDate={endDate} onApply={onApplyRange} />
          <Button
            type="button"
            loading={importPending}
            disabled={!dateRangeValid}
            onClick={onImport}
          >
            <DatabaseZap size={14} aria-hidden="true" />
            Importar ahora
          </Button>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-400">
            Comparar
          </span>
          <div className="flex flex-wrap gap-1">
            {COMPARISON_OPTIONS.map((option) => (
              <button
                type="button"
                key={option.id}
                onClick={() => onComparisonChange(option.id)}
                className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold transition ${
                  comparison === option.id
                    ? 'border-brand-500 bg-brand-50 text-brand-700'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-brand-200 hover:text-brand-700'
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function TabNav({ tab, onChange }: { tab: SearchTab; onChange: (tab: SearchTab) => void }) {
  return (
    <div className="flex flex-wrap gap-1 border-b border-slate-200">
      {SEARCH_TABS.map((entry) => (
        <button
          type="button"
          key={entry.id}
          onClick={() => onChange(entry.id)}
          className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold transition ${
            tab === entry.id
              ? 'border-brand-600 text-brand-700'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}

type GscState = ReturnType<typeof useSearchConsole>;

function TabPanels({ tab, gsc }: { tab: SearchTab; gsc: GscState }) {
  const summary = gsc.summary.data;
  const topQueries = gsc.topQueries.data ?? [];
  const topPages = gsc.topPages.data ?? [];
  const topCountries = gsc.topCountries.data ?? [];
  const topDevices = gsc.topDevices.data ?? [];

  if (tab === 'overview') {
    const previous = gsc.comparison === 'none' ? undefined : gsc.previousSummary.data;
    const timeseries = gsc.timeseries.data ?? [];
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Clicks"
            value={formatNumber(summary?.clicks ?? 0)}
            icon={MousePointerClick}
            delta={<DeltaBadge current={summary?.clicks ?? 0} previous={previous?.clicks} />}
          />
          <MetricCard
            label="Impresiones"
            value={formatNumber(summary?.impressions ?? 0)}
            icon={TrendingUp}
            delta={
              <DeltaBadge current={summary?.impressions ?? 0} previous={previous?.impressions} />
            }
          />
          <MetricCard
            label="CTR"
            value={formatPercent(summary?.ctr ?? 0)}
            icon={Target}
            delta={<DeltaBadge current={summary?.ctr ?? 0} previous={previous?.ctr} />}
          />
          <MetricCard
            label="Posición"
            value={formatPosition(summary?.position ?? 0)}
            icon={BarChart3}
            delta={
              <DeltaBadge
                current={summary?.position ?? 0}
                previous={previous?.position}
                lowerIsBetter
              />
            }
          />
        </div>

        <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
            <TrendingUp size={14} className="text-brand-500" aria-hidden="true" />
            Clicks e impresiones
          </h3>
          {timeseries.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
              Sin datos en el periodo. Importa Search Console para ver la evolución.
            </p>
          ) : (
            <div className="mt-3">
              <ClicksImpressionsChart points={timeseries} />
            </div>
          )}
        </section>

        <div className="grid gap-3 lg:grid-cols-2">
          <TopList
            title="Top consultas"
            rows={topQueries.slice(0, 5)}
            empty="Sin consultas importadas."
            icon={Search}
          />
          <TopList
            title="Top URLs"
            rows={topPages.slice(0, 5)}
            empty="Sin URLs importadas."
            icon={Globe2}
          />
        </div>
      </div>
    );
  }

  if (tab === 'queries') {
    return (
      <TopList
        title="Consultas"
        rows={topQueries}
        empty="Sin consultas importadas."
        icon={Search}
      />
    );
  }

  if (tab === 'pages') {
    return <TopList title="URLs" rows={topPages} empty="Sin URLs importadas." icon={Globe2} />;
  }

  if (tab === 'opportunities') {
    return <OpportunitiesTable rows={gsc.opportunities.data ?? []} />;
  }

  if (tab === 'cannibalization') {
    return <CannibalizationGroups groups={gsc.cannibalization.data ?? []} />;
  }

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <TopList
        title="Países"
        rows={topCountries}
        empty="Sin países importados."
        valueFormatter={formatCountry}
        valuePrefix={(value) => <CountryFlag countryCode={value} />}
        icon={Globe2}
      />
      <TopList
        title="Dispositivos"
        rows={topDevices}
        empty="Sin dispositivos importados."
        valueFormatter={formatDevice}
        valuePrefix={(value) => <DeviceIcon device={value} />}
        icon={BarChart3}
      />
    </div>
  );
}
