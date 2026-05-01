import { Minus, TrendingDown, TrendingUp } from 'lucide-react';

type DeltaVariant = 'filled' | 'subtle' | 'ghost';

/** A delta indicator (+12, -3, "Sin cambio") with consistent tone across the app. */
export function DeltaBadge({
  delta,
  variant = 'filled',
  unit,
  zeroLabel = 'Sin cambio',
  title,
}: {
  delta: number | null;
  variant?: DeltaVariant;
  /** Optional unit suffix, e.g. "pts" */
  unit?: string;
  zeroLabel?: string;
  title?: string;
}) {
  if (delta === null) {
    return null;
  }

  if (delta === 0) {
    const zeroCls =
      variant === 'subtle'
        ? 'bg-slate-100 text-slate-600'
        : variant === 'ghost'
          ? 'text-slate-500'
          : 'bg-slate-100 text-slate-600';
    return (
      <span
        title={title}
        className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ${zeroCls}`}
      >
        <Minus size={12} aria-hidden="true" />
        {zeroLabel}
      </span>
    );
  }

  const positive = delta > 0;
  const Icon = positive ? TrendingUp : TrendingDown;

  const cls =
    variant === 'subtle'
      ? positive
        ? 'bg-emerald-50 text-emerald-700'
        : 'bg-rose-50 text-rose-700'
      : variant === 'ghost'
        ? positive
          ? 'text-emerald-600'
          : 'text-rose-600'
        : positive
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-rose-50 text-rose-700';

  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold tabular-nums ${cls}`}
    >
      <Icon size={12} aria-hidden="true" />
      {positive ? '+' : ''}
      {delta}
      {unit ? ` ${unit}` : ''}
    </span>
  );
}
