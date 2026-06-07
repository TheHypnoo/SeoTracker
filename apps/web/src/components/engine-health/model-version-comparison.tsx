import type { EngineModelVersionStats } from '@seotracker/shared-types';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

import { formatDuration } from '#/components/audit-detail/audit-detail-formatters';
import { humanizeStage } from './stage-labels';

const REGRESSION_THRESHOLD = 0.15;

function versionLabel(version: string | null): string {
  return version ?? 'legacy';
}

/**
 * Compares the two most recent scoring-model versions stage-by-stage and flags p95 latency
 * regressions. This is the headline "is the new model slower?" view: a positive p95 delta
 * above the threshold is highlighted as a regression.
 */
export function ModelVersionComparison({ rows }: { rows: EngineModelVersionStats[] }) {
  const versions = [...new Set(rows.map((r) => r.scoringModelVersion))].sort((a, b) => {
    if (a === null) return 1;
    if (b === null) return -1;
    return b.localeCompare(a);
  });

  if (versions.length === 0) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
        No hay datos de versiones del modelo en este periodo.
      </p>
    );
  }

  if (versions.length === 1) {
    return (
      <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
        Solo se ha ejecutado la versión{' '}
        <span className="font-mono font-semibold text-slate-700">
          {versionLabel(versions[0] ?? null)}
        </span>{' '}
        del modelo en este periodo. La comparación aparecerá cuando haya una segunda versión.
      </p>
    );
  }

  const current = versions[0] ?? null;
  const previous = versions[1] ?? null;
  const previousByStage = new Map(
    rows.filter((r) => r.scoringModelVersion === previous).map((r) => [r.stage, r]),
  );
  const currentRows = rows
    .filter((r) => r.scoringModelVersion === current)
    .sort((a, b) => b.p95DurationMs - a.p95DurationMs);

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600">
        Comparando{' '}
        <span className="font-mono font-semibold text-slate-900">{versionLabel(current)}</span>{' '}
        (actual) frente a{' '}
        <span className="font-mono font-semibold text-slate-900">{versionLabel(previous)}</span> en
        latencia p95 por etapa.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] font-bold uppercase tracking-[0.12em] text-slate-500">
              <th className="px-4 py-2.5">Etapa</th>
              <th className="px-4 py-2.5 text-right">p95 {versionLabel(current)}</th>
              <th className="px-4 py-2.5 text-right">p95 {versionLabel(previous)}</th>
              <th className="px-4 py-2.5 text-right">Variación</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {currentRows.map((row) => {
              const prev = previousByStage.get(row.stage);
              const delta = prev ? row.p95DurationMs - prev.p95DurationMs : null;
              const pct = prev && prev.p95DurationMs > 0 ? (delta ?? 0) / prev.p95DurationMs : null;
              const isRegression = pct !== null && pct > REGRESSION_THRESHOLD;
              const isImprovement = pct !== null && pct < -REGRESSION_THRESHOLD;
              return (
                <tr
                  key={row.stage}
                  className={isRegression ? 'bg-rose-50/60' : 'hover:bg-slate-50/60'}
                >
                  <td className="px-4 py-2.5 font-medium text-slate-700">
                    {humanizeStage(row.stage)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums font-semibold text-slate-900">
                    {formatDuration(row.p95DurationMs)}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-slate-500">
                    {prev ? formatDuration(prev.p95DurationMs) : '—'}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    {pct === null ? (
                      <span className="text-xs text-slate-400">nueva etapa</span>
                    ) : (
                      <span
                        className={`inline-flex items-center justify-end gap-1 tabular-nums font-semibold ${
                          isRegression
                            ? 'text-rose-600'
                            : isImprovement
                              ? 'text-emerald-600'
                              : 'text-slate-500'
                        }`}
                      >
                        {isRegression ? (
                          <ArrowUpRight size={13} aria-hidden="true" />
                        ) : isImprovement ? (
                          <ArrowDownRight size={13} aria-hidden="true" />
                        ) : (
                          <Minus size={13} aria-hidden="true" />
                        )}
                        {pct > 0 ? '+' : ''}
                        {Math.round(pct * 100)}%
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
