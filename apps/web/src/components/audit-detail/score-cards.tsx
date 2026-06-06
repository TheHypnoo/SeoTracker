import type { ScoreBreakdown } from '@seotracker/shared-types';
import { Gauge, Minus, TrendingDown, TrendingUp } from 'lucide-react';

import { CATEGORY_LABELS } from '../../lib/issue-codes';
import { scoreTone, severityLabel, severityStyle } from './audit-detail-formatters';
import type { AuditRun, Severity } from './audit-detail-types';

const SCORE_SEVERITIES: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

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

export function ScoreContextPanel({
  run,
}: {
  run: Pick<
    AuditRun,
    'seoScore' | 'crawlConfidenceScore' | 'criticalRisk' | 'scoreBreakdown' | 'scoringModelVersion'
  >;
}) {
  // Older audits may carry a legacy `score_breakdown` shape (perSeverity /
  // totalDeduction) or an empty `{}`. Only treat it as the active-model
  // breakdown when the discriminating fields are actually present, so we never
  // read `.criticalRisk.level` off a legacy payload.
  const breakdown = asModelBreakdown(run.scoreBreakdown);
  if (!breakdown && run.seoScore === null && run.crawlConfidenceScore === null) {
    return null;
  }
  const risk = breakdown?.criticalRisk.level ?? run.criticalRisk ?? 'NONE';
  const confidence = breakdown?.crawlConfidenceScore ?? run.crawlConfidenceScore;
  const seoScore = breakdown?.seoScore ?? run.seoScore;

  return (
    <div className="mt-5 rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-700">
            Modelo de score activo
          </div>
          <p className="mt-1 max-w-2xl text-sm text-slate-600">
            El score principal combina salud SEO, confianza del crawl y riesgos críticos para evitar
            penalizaciones genéricas.
          </p>
        </div>
        <span className="rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-500">
          {breakdown?.modelVersion ?? run.scoringModelVersion ?? 'v2.0'}
        </span>
      </div>

      <dl className="mt-4 grid gap-3 sm:grid-cols-3">
        <ContextMetric label="Salud SEO" value={seoScore !== null ? `${seoScore}/100` : '--'} />
        <ContextMetric
          label="Confianza del crawl"
          value={confidence !== null ? `${confidence}/100` : '--'}
          hint={confidence !== null && confidence < 55 ? 'Baja confianza: lectura cautelosa' : null}
        />
        <ContextMetric
          label="Riesgo crítico"
          value={criticalRiskLabel(risk)}
          tone={riskTone(risk)}
        />
      </dl>

      {breakdown?.confidenceAdjustment.applied ? (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
          {breakdown.confidenceAdjustment.reason}
        </p>
      ) : null}

      {breakdown?.criticalRisk.reasons.length ? (
        <ul className="mt-3 list-inside list-disc text-xs text-slate-600">
          {breakdown.criticalRisk.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}

      {breakdown?.topDeductions.length ? (
        <div className="mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
            Principales penalizaciones
          </div>
          <ul className="mt-2 grid gap-2">
            {breakdown.topDeductions.map((deduction) => (
              <li
                key={deduction.issueCode}
                className="rounded-lg border border-white bg-white/80 px-3 py-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono text-xs font-semibold text-slate-800">
                    {deduction.issueCode}
                  </span>
                  <span className="text-xs font-bold text-rose-700">
                    -{deduction.cappedDeduction.toFixed(1)} pts
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {deduction.reason} · {deduction.occurrences} ocurrencia
                  {deduction.occurrences === 1 ? '' : 's'} · falso positivo:{' '}
                  {falsePositiveRiskLabel(deduction.falsePositiveRisk)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function ContextMetric({
  label,
  value,
  hint,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  hint?: string | null;
  tone?: 'neutral' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'danger' ? 'text-rose-700' : tone === 'warning' ? 'text-amber-700' : 'text-slate-900';
  return (
    <div className="rounded-lg border border-white bg-white/80 px-3 py-2">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt>
      <dd className={`mt-1 text-lg font-black tabular-nums ${toneClass}`}>{value}</dd>
      {hint ? <p className="mt-1 text-xs text-amber-700">{hint}</p> : null}
    </div>
  );
}

/**
 * Returns the breakdown only when it matches the active score model. Legacy
 * payloads (perSeverity/totalDeduction) or an empty `{}` return null, so the
 * panel falls back to the scalar columns instead of crashing on missing fields.
 */
function asModelBreakdown(value: unknown): ScoreBreakdown | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as Record<string, unknown>;
  const criticalRisk = candidate.criticalRisk as Record<string, unknown> | undefined;
  if (
    typeof candidate.modelVersion !== 'string' ||
    typeof candidate.seoScore !== 'number' ||
    !criticalRisk ||
    typeof criticalRisk.level !== 'string' ||
    !Array.isArray(criticalRisk.reasons) ||
    typeof candidate.confidenceAdjustment !== 'object' ||
    candidate.confidenceAdjustment === null ||
    !Array.isArray(candidate.topDeductions)
  ) {
    return null;
  }
  return value as ScoreBreakdown;
}

function criticalRiskLabel(risk: string | null): string {
  if (risk === 'BLOCKING') return 'Bloqueante';
  if (risk === 'WARNING') return 'Aviso';
  return 'Sin bloqueo';
}

function riskTone(risk: string | null): 'neutral' | 'warning' | 'danger' {
  if (risk === 'BLOCKING') return 'danger';
  if (risk === 'WARNING') return 'warning';
  return 'neutral';
}

function falsePositiveRiskLabel(risk: string): string {
  if (risk === 'HIGH') return 'alto';
  if (risk === 'LOW') return 'bajo';
  return 'medio';
}

export function SeverityBreakdown({
  counts,
  total,
}: {
  counts: Record<Severity, number>;
  total: number;
}) {
  return (
    <div className="mt-6 border-t border-slate-100 pt-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          Reparto por severidad
        </span>
        <span className="text-xs text-slate-500">{total} totales</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SCORE_SEVERITIES.map((severity) => {
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
