import type { EngineStageAggregate } from '@seotracker/shared-types';

import { formatDuration } from '#/components/audit-detail/audit-detail-formatters';
import { formatNumber, formatPercent } from '#/components/search-console/format';
import { humanizeStage } from './stage-labels';

/**
 * Per-stage reliability/latency table for the engine-health dashboard: p50/p95/avg/max
 * duration, sample count and error rate. The p95 column carries a proportional bar so the
 * slowest stages read at a glance.
 */
export function StageStatsTable({ stages }: { stages: EngineStageAggregate[] }) {
  if (stages.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
        No hay telemetría del motor en este periodo. Lanza una auditoría para empezar a medir.
      </p>
    );
  }

  const maxP95 = stages.reduce((max, s) => Math.max(max, s.p95DurationMs), 0);

  return (
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
            <th className="px-4 py-2.5">Etapa</th>
            <th className="px-4 py-2.5 text-right">p50</th>
            <th className="px-4 py-2.5">p95</th>
            <th className="px-4 py-2.5 text-right">Media</th>
            <th className="px-4 py-2.5 text-right">Máx</th>
            <th className="px-4 py-2.5 text-right">Muestras</th>
            <th className="px-4 py-2.5 text-right">Errores</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {stages.map((stage) => {
            const widthPct = maxP95 > 0 ? Math.max(2, (stage.p95DurationMs / maxP95) * 100) : 2;
            const hasErrors = stage.errorRate > 0;
            return (
              <tr key={stage.stage} className="hover:bg-slate-50/60">
                <td className="px-4 py-2.5 font-medium text-slate-700">
                  {humanizeStage(stage.stage)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                  {formatDuration(stage.p50DurationMs)}
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-brand-500"
                        style={{ width: `${widthPct}%` }}
                      />
                    </div>
                    <span className="tabular-nums font-semibold text-slate-900">
                      {formatDuration(stage.p95DurationMs)}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                  {formatDuration(stage.avgDurationMs)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                  {formatDuration(stage.maxDurationMs)}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-slate-600">
                  {formatNumber(stage.sampleCount)}
                </td>
                <td
                  className={`px-4 py-2.5 text-right tabular-nums font-semibold ${
                    hasErrors ? 'text-rose-600' : 'text-emerald-600'
                  }`}
                >
                  {formatPercent(stage.errorRate)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
