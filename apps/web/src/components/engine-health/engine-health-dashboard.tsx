import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { EngineHealthTimeseriesPoint, EngineStageAggregate } from '@seotracker/shared-types';
import { Activity, AlertTriangle, ArrowLeft, Gauge, Timer, X } from 'lucide-react';
import { useMemo, useState } from 'react';

import { MultiSeriesTrendChart } from '#/components/charts/multi-series-trend-chart';
import type {
  MultiSeriesPoint,
  SeriesDef,
} from '#/components/charts/multi-series-trend-chart.recharts';
import { formatDuration } from '#/components/audit-detail/audit-detail-formatters';
import { ModelVersionComparison } from '#/components/engine-health/model-version-comparison';
import { StageStatsTable } from '#/components/engine-health/stage-stats-table';
import { humanizeStage, stageColor } from '#/components/engine-health/stage-labels';
import { useEngineHealth } from '#/components/engine-health/use-engine-health';
import { formatNumber, formatPercent } from '#/components/search-console/format';
import { QueryState } from '#/components/query-state';
import { Notice } from '#/components/notice';
import { useAuth } from '#/lib/auth-context';
import { usePlatformAdmin } from '#/lib/use-platform-admin';

type Site = { id: string; name: string; domain: string; projectId: string };

type HealthTab = 'overview' | 'trends' | 'versions';

const HEALTH_TABS: Array<{ id: HealthTab; label: string }> = [
  { id: 'overview', label: 'Resumen' },
  { id: 'trends', label: 'Evolución' },
  { id: 'versions', label: 'Versiones del modelo' },
];

const RANGE_OPTIONS = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
];

export function EngineHealthDashboard({
  projectId,
  siteId,
}: {
  projectId?: string;
  siteId?: string;
}) {
  const auth = useAuth();
  const [tab, setTab] = useState<HealthTab>('overview');
  const [rangeDays, setRangeDays] = useState(30);
  const isPlatformAdmin = usePlatformAdmin();

  const { data: siteData } = useQuery({
    queryKey: ['site', siteId],
    queryFn: () => auth.api.get<Site>(`/sites/${siteId}`),
    enabled: Boolean(auth.user && isPlatformAdmin && siteId),
  });

  const { data: projectData } = useQuery({
    queryKey: ['project', projectId],
    queryFn: () => auth.api.get<{ id: string; name: string }>(`/projects/${projectId}`),
    enabled: Boolean(auth.user && isPlatformAdmin && projectId),
  });

  const { summary, timeseries, modelVersions } = useEngineHealth(rangeDays, isPlatformAdmin, {
    projectId,
    siteId,
  });

  const stages = useMemo(() => summary.data?.stages ?? [], [summary.data]);
  const headline = useMemo(() => deriveHeadline(stages), [stages]);
  const { chartData, chartSeries } = useMemo(
    () => buildChartSeries(timeseries.data ?? []),
    [timeseries.data],
  );

  if (!isPlatformAdmin) {
    return (
      <section className="space-y-5">
        <Notice tone="warning">
          <p className="font-semibold">Área restringida</p>
          <p className="mt-0.5">
            La salud del motor es observabilidad interna de la plataforma y solo está disponible
            para administradores.
          </p>
        </Notice>
      </section>
    );
  }

  const title = siteId
    ? (siteData?.name ?? 'Cargando...')
    : projectId
      ? (projectData?.name ?? 'Salud del motor por proyecto')
      : 'Salud global del motor';
  const subtitle = siteId
    ? (siteData?.domain ?? 'Filtro por dominio')
    : projectId
      ? 'Filtro por proyecto'
      : 'Todas las auditorías de todos los proyectos';

  return (
    <section className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          {siteId ? (
            <div className="flex flex-wrap items-center gap-3">
              <Link
                to="/sites/$id"
                params={{ id: siteId }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 transition hover:text-brand-700"
              >
                <ArrowLeft size={14} aria-hidden="true" />
                Volver al dominio
              </Link>
              <Link
                to="/engine-health"
                search={{ projectId: undefined, siteId: undefined }}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800"
              >
                <X size={13} aria-hidden="true" />
                Ver global
              </Link>
            </div>
          ) : projectId ? (
            <Link
              to="/engine-health"
              search={{ projectId: undefined, siteId: undefined }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-700 transition hover:text-brand-800"
            >
              <X size={13} aria-hidden="true" />
              Ver global
            </Link>
          ) : null}
          <div className="mt-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
            Observabilidad interna de plataforma
          </div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight text-slate-950">{title}</h1>
          <div className="mt-0.5 font-mono text-sm text-slate-500">{subtitle}</div>
        </div>
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm">
          {RANGE_OPTIONS.map((option) => (
            <button
              key={option.days}
              type="button"
              onClick={() => setRangeDays(option.days)}
              className={`rounded-md px-3 py-1.5 font-semibold transition ${
                rangeDays === option.days
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>

      {siteId || projectId ? (
        <Notice tone="neutral">
          <p className="font-semibold">Vista filtrada por {siteId ? 'dominio' : 'proyecto'}</p>
          <p className="mt-0.5">
            El dashboard principal agrega toda la plataforma; esta vista sirve como drilldown para
            investigar un subconjunto concreto.
          </p>
        </Notice>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Activity size={14} aria-hidden="true" />}
          label="Auditorías medidas"
          value={summary.data ? formatNumber(summary.data.runCount) : '—'}
        />
        <KpiCard
          icon={<Gauge size={14} aria-hidden="true" />}
          label="Etapa más lenta (p95)"
          value={headline.slowestStage ? formatDuration(headline.slowestP95) : '—'}
          hint={headline.slowestStage ? humanizeStage(headline.slowestStage) : undefined}
        />
        <KpiCard
          icon={<Timer size={14} aria-hidden="true" />}
          label="Duración total típica"
          value={headline.totalP50 > 0 ? formatDuration(headline.totalP50) : '—'}
          hint="suma de p50 por etapa"
        />
        <KpiCard
          icon={<AlertTriangle size={14} aria-hidden="true" />}
          label="Tasa de error"
          value={formatPercent(headline.errorRate)}
          tone={headline.errorRate > 0 ? 'danger' : 'ok'}
        />
      </div>

      <nav className="flex flex-wrap gap-1 border-b border-slate-200">
        {HEALTH_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold transition ${
              tab === item.id
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>

      {tab === 'overview' ? (
        <QueryState
          status={summary.status}
          data={summary.data}
          error={summary.error}
          onRetry={() => void summary.refetch()}
        >
          {(data) => <StageStatsTable stages={data.stages} />}
        </QueryState>
      ) : null}

      {tab === 'trends' ? (
        <QueryState
          status={timeseries.status}
          data={timeseries.data}
          error={timeseries.error}
          onRetry={() => void timeseries.refetch()}
        >
          {() => (
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h2 className="mb-1 text-sm font-semibold text-slate-800">
                p95 por etapa a lo largo del tiempo
              </h2>
              <p className="mb-3 text-xs text-slate-500">
                Latencia p95 (ms) de cada etapa del motor por día.
              </p>
              {chartData.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Sin datos suficientes para dibujar la evolución.
                </p>
              ) : (
                <MultiSeriesTrendChart
                  data={chartData}
                  series={chartSeries}
                  height={280}
                  yDomain={[0, 'auto']}
                  yAxisWidth={48}
                  yTickFormatter={(value) => formatDuration(Number(value))}
                  tooltipValueFormatter={(value) => formatDuration(Number(value))}
                />
              )}
            </div>
          )}
        </QueryState>
      ) : null}

      {tab === 'versions' ? (
        <QueryState
          status={modelVersions.status}
          data={modelVersions.data}
          error={modelVersions.error}
          onRetry={() => void modelVersions.refetch()}
        >
          {(data) => <ModelVersionComparison rows={data} />}
        </QueryState>
      ) : null}
    </section>
  );
}

function KpiCard({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'ok' | 'danger';
}) {
  const valueTone =
    tone === 'danger' ? 'text-rose-600' : tone === 'ok' ? 'text-emerald-600' : 'text-slate-950';
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <span className="text-brand-600">{icon}</span>
        {label}
      </div>
      <div className={`mt-1 text-2xl font-black tabular-nums ${valueTone}`}>{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}

function deriveHeadline(stages: EngineStageAggregate[]) {
  let slowestStage: string | null = null;
  let slowestP95 = 0;
  let totalP50 = 0;
  let weightedErrors = 0;
  let totalSamples = 0;
  for (const stage of stages) {
    totalP50 += stage.p50DurationMs;
    weightedErrors += stage.errorCount;
    totalSamples += stage.sampleCount;
    if (stage.p95DurationMs > slowestP95) {
      slowestP95 = stage.p95DurationMs;
      slowestStage = stage.stage;
    }
  }
  return {
    slowestStage,
    slowestP95,
    totalP50,
    errorRate: totalSamples > 0 ? weightedErrors / totalSamples : 0,
  };
}

function buildChartSeries(points: EngineHealthTimeseriesPoint[]): {
  chartData: MultiSeriesPoint[];
  chartSeries: SeriesDef[];
} {
  if (points.length === 0) return { chartData: [], chartSeries: [] };
  const stageList = [...new Set(points.map((p) => p.stage))];
  const series: SeriesDef[] = stageList.map((stage, index) => ({
    key: stage,
    label: humanizeStage(stage),
    color: stageColor(index),
  }));
  const byDate = new Map<string, MultiSeriesPoint>();
  for (const point of points) {
    let row = byDate.get(point.date);
    if (!row) {
      row = { id: point.date, timestamp: point.date };
      byDate.set(point.date, row);
    }
    row[point.stage] = point.p95DurationMs;
  }
  const chartData = [...byDate.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { chartData, chartSeries: series };
}
