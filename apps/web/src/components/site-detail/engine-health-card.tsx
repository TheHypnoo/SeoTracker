import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import type { EngineHealthSummary } from '@seotracker/shared-types';
import { Activity, ArrowRight, Gauge } from 'lucide-react';

import { Skeleton } from '#/components/skeleton';
import { formatDuration } from '#/components/audit-detail/audit-detail-formatters';
import { humanizeStage } from '#/components/engine-health/stage-labels';
import { formatNumber, formatPercent } from '#/components/search-console/format';
import { useAuth } from '#/lib/auth-context';
import { usePlatformAdmin } from '#/lib/use-platform-admin';

/**
 * Compact engine-observability entry point on the site detail page. Shows a glance of the
 * SEO engine's recent performance; the full dashboard lives at `/sites/:id/engine-health`.
 */
export function EngineHealthCard({ siteId }: { siteId: string }) {
  const auth = useAuth();
  const isPlatformAdmin = usePlatformAdmin();
  const { data, isLoading } = useQuery({
    queryKey: ['engine-health-card', siteId],
    queryFn: () => auth.api.get<EngineHealthSummary>(`/sites/${siteId}/audits/engine-health`),
    enabled: Boolean(auth.accessToken && siteId && isPlatformAdmin),
  });

  // Internal observability: invisible to anyone who is not a platform operator.
  if (!isPlatformAdmin) return null;

  const slowest = data?.stages.reduce<EngineHealthSummary['stages'][number] | null>(
    (max, stage) => (max && max.p95DurationMs >= stage.p95DurationMs ? max : stage),
    null,
  );
  const errorSamples = data?.stages.reduce((sum, s) => sum + s.errorCount, 0) ?? 0;
  const errorRate = data && data.totalSamples > 0 ? errorSamples / data.totalSamples : 0;
  const hasData = Boolean(data && data.runCount > 0);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="grid size-9 place-items-center rounded-xl bg-brand-50 text-brand-600 ring-1 ring-brand-100">
            <Activity size={17} aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-black tracking-tight text-slate-950">Salud del motor</h2>
            <p className="text-xs leading-5 text-slate-500">
              Rendimiento y fiabilidad del motor SEO por etapa.
            </p>
          </div>
        </div>
        <Link
          to="/sites/$id/engine-health"
          params={{ id: siteId }}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-brand-700 transition hover:border-brand-200 hover:bg-brand-subtle focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
        >
          Ver observabilidad
          <ArrowRight size={14} aria-hidden="true" />
        </Link>
      </div>

      {isLoading ? (
        <Skeleton className="mt-4 h-20 w-full" />
      ) : hasData ? (
        <div className="mt-4 grid gap-2 sm:grid-cols-3">
          <CompactMetric label="Auditorías (30d)" value={formatNumber(data?.runCount ?? 0)} />
          <CompactMetric
            label="Etapa más lenta"
            value={slowest ? formatDuration(slowest.p95DurationMs) : '—'}
            hint={slowest ? humanizeStage(slowest.stage) : undefined}
            icon={<Gauge size={13} aria-hidden="true" />}
          />
          <CompactMetric
            label="Tasa de error"
            value={formatPercent(errorRate)}
            tone={errorRate > 0 ? 'danger' : 'ok'}
          />
        </div>
      ) : (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          Aún no hay telemetría del motor. Lanza una auditoría para empezar a medir el rendimiento
          por etapa.
        </p>
      )}
    </section>
  );
}

function CompactMetric({
  label,
  value,
  hint,
  icon,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'danger';
}) {
  const valueTone =
    tone === 'danger' ? 'text-rose-600' : tone === 'ok' ? 'text-emerald-600' : 'text-slate-950';
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
      <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        {icon ? <span className="text-brand-600">{icon}</span> : null}
        {label}
      </div>
      <div className={`mt-1 text-xl font-black tabular-nums ${valueTone}`}>{value}</div>
      {hint ? <div className="mt-0.5 truncate text-[11px] text-slate-400">{hint}</div> : null}
    </div>
  );
}
