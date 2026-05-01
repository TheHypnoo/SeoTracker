import type { ReactNode } from 'react';
import { DeltaBadge } from './delta-badge';

type ScoreVariant = 'gauge' | 'card' | 'pill';

function scoreToneText(score: number | null) {
  if (score === null) return 'text-slate-400';
  if (score >= 85) return 'text-emerald-600';
  if (score >= 65) return 'text-amber-600';
  return 'text-rose-600';
}

function scoreToneRing(score: number | null) {
  if (score === null) return 'stroke-slate-400';
  if (score >= 85) return 'stroke-emerald-500';
  if (score >= 65) return 'stroke-amber-500';
  return 'stroke-rose-500';
}

function scoreToneBg(score: number | null) {
  if (score === null) return 'bg-slate-100';
  if (score >= 85) return 'bg-emerald-50';
  if (score >= 65) return 'bg-amber-50';
  return 'bg-rose-50';
}

function scoreToneBorder(score: number | null) {
  if (score === null) return 'border-slate-200';
  if (score >= 85) return 'border-emerald-200';
  if (score >= 65) return 'border-amber-200';
  return 'border-rose-200';
}

/**
 * Single source of truth for "score / 100" presentation across dashboard,
 * site detail and audit detail. Variants:
 *   - gauge: animated SVG ring with score in the center (dark hero card)
 *   - card: square box with the score number and "/ 100" caption
 *   - pill: small inline pill, mostly for KPI rows
 */
export function ScoreDisplay({
  score,
  variant,
  delta = null,
  caption,
  size,
}: {
  score: number | null;
  variant: ScoreVariant;
  delta?: number | null;
  caption?: ReactNode;
  /** For "card" variant: small/medium. Default medium. */
  size?: 'sm' | 'md';
}) {
  const hasScore = score !== null;
  const display = hasScore ? score : '—';

  if (variant === 'gauge') {
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const value = score ?? 0;
    const offset = hasScore ? circumference - (value / 100) * circumference : circumference;

    return (
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative inline-flex items-center justify-center">
          <svg
            width="128"
            height="128"
            viewBox="0 0 128 128"
            aria-hidden="true"
            className="-rotate-90"
          >
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              stroke="rgb(51, 65, 85)"
              strokeWidth="8"
            />
            <circle
              cx="64"
              cy="64"
              r={radius}
              fill="none"
              strokeWidth="8"
              strokeLinecap="round"
              className={scoreToneRing(score)}
              style={{
                strokeDasharray: circumference,
                strokeDashoffset: offset,
                transition: 'stroke-dashoffset 600ms ease',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span
              className={`text-4xl font-bold tabular-nums ${
                hasScore ? scoreToneText(score) : 'text-slate-400'
              }`}
            >
              {display}
            </span>
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
              / 100
            </span>
          </div>
        </div>
        {caption ? <div className="min-w-0 flex-1">{caption}</div> : null}
      </div>
    );
  }

  if (variant === 'card') {
    const sizeBox = size === 'sm' ? 'h-20 w-20' : 'h-24 w-24';
    const sizeText = size === 'sm' ? 'text-3xl' : 'text-4xl';
    return (
      <div className="flex items-center gap-4">
        <div
          className={`flex ${sizeBox} flex-col items-center justify-center rounded-2xl border ${scoreToneBorder(score)} ${scoreToneBg(score)}`}
        >
          <span
            className={`${sizeText} font-bold leading-none tracking-tight ${scoreToneText(score)}`}
          >
            {display}
          </span>
          <span className="mt-1 text-[10px] font-medium text-slate-500">/ 100</span>
        </div>
        {caption || delta !== null ? (
          <div className="min-w-0">
            {caption}
            {delta !== null ? (
              <div className="mt-1">
                <DeltaBadge delta={delta} variant="subtle" />
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  // pill
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-semibold tabular-nums ${scoreToneBg(score)} ${scoreToneText(score)}`}
    >
      {display}
      <span className="text-[10px] font-medium opacity-70">/ 100</span>
    </span>
  );
}
