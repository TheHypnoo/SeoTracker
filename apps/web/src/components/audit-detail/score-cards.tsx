import { Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { CATEGORY_LABELS } from '../../lib/issue-codes';
import { scoreTone, severityLabel, severityStyle } from './audit-detail-formatters';
import type { AuditRun, Severity } from './audit-detail-types';

export function ScoreCard({
  score,
  previousScore,
  scoreDelta,
}: {
  score: number | null;
  previousScore: number | null;
  scoreDelta: number | null;
}) {
  const displayScore = score ?? 0;
  const tone = scoreTone(score);
  return (
    <div className="flex items-center gap-4">
      <div
        className={`flex h-24 w-24 flex-col items-center justify-center rounded-2xl border ${tone.border} ${tone.bg}`}
      >
        <span className={`text-4xl font-black leading-none tracking-tight ${tone.text}`}>
          {score !== null ? displayScore : '--'}
        </span>
        <span className="mt-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          / 100
        </span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          <Gauge size={12} aria-hidden="true" /> Score SEO
        </div>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-sm text-slate-600">{tone.caption}</p>
          {scoreDelta !== null && previousScore !== null ? (
            <ScoreDeltaBadge delta={scoreDelta} previousScore={previousScore} />
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScoreDeltaBadge({ delta, previousScore }: { delta: number; previousScore: number }) {
  if (delta === 0) {
    return (
      <span
        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600"
        title={`Sin cambios vs. auditoría previa (${previousScore})`}
      >
        <Minus size={10} aria-hidden="true" />0
      </span>
    );
  }
  const positive = delta > 0;
  const cls = positive
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-rose-50 text-rose-700 border-rose-200';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${cls}`}
      title={`vs. auditoría anterior (${previousScore})`}
    >
      {positive ? (
        <TrendingUp size={10} aria-hidden="true" />
      ) : (
        <TrendingDown size={10} aria-hidden="true" />
      )}
      {positive ? '+' : ''}
      {delta}
    </span>
  );
}

export function CategoryScoreStrip({ scores }: { scores: Record<string, number> }) {
  const entries = Object.entries(scores);
  if (entries.length === 0) return null;
  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
        Score por categoría
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {entries.map(([category, value]) => {
          const tone = scoreTone(value);
          return (
            <div
              key={category}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${tone.border} ${tone.bg}`}
            >
              <div className={`text-xl font-bold tabular-nums ${tone.text}`}>{value}</div>
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                  {CATEGORY_LABELS[category] ?? category}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/60">
                  <div className={`h-full ${tone.bar}`} style={{ width: `${value}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function ScoreBreakdownPanel({
  breakdown,
  baseScore,
}: {
  breakdown: AuditRun['scoreBreakdown'];
  baseScore: number | null;
}) {
  if (!breakdown) return null;
  const severities: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  return (
    <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Desglose del score
        </span>
        <span className="text-xs text-slate-500">
          100 − {breakdown.totalDeduction} = {baseScore ?? '--'}
        </span>
      </div>
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {severities.map((sev) => {
          const entry = breakdown.perSeverity[sev];
          const raw = entry?.rawDeduction ?? 0;
          const capped = entry?.cappedDeduction ?? 0;
          const capTriggered = raw > capped;
          const tone = severityStyle(sev);
          return (
            <div
              key={sev}
              className={`rounded-lg border px-3 py-2 ${tone.border} bg-white`}
              title={
                capTriggered
                  ? `Deducción bruta ${raw.toFixed(1)} limitada por el cap de severidad`
                  : undefined
              }
            >
              <div className={`text-[11px] font-semibold uppercase tracking-wider ${tone.label}`}>
                {severityLabel(sev)}
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`text-lg font-bold tabular-nums ${tone.value}`}>
                  -{capped.toFixed(1)}
                </span>
                {capTriggered ? (
                  <span className="text-[10px] font-semibold text-slate-400 line-through">
                    -{raw.toFixed(1)}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function SeverityBreakdown({
  counts,
  total,
}: {
  counts: Record<Severity, number>;
  total: number;
}) {
  const severities: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Reparto por severidad
        </span>
        <span className="text-xs text-slate-500">{total} totales</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {severities.map((severity) => {
          const count = counts[severity] ?? 0;
          const tone = severityStyle(severity);
          const percent = total === 0 ? 0 : Math.round((count / total) * 100);
          return (
            <div
              key={severity}
              className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${tone.border} ${tone.surface}`}
            >
              <div className={`text-xl font-bold tabular-nums ${tone.value}`}>{count}</div>
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-semibold uppercase tracking-wider ${tone.label}`}>
                  {severityLabel(severity)}
                </div>
                <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/60">
                  <div className={`h-full ${tone.bar}`} style={{ width: `${percent}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
