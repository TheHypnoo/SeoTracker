import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';

const PERCENT_FORMATTER = new Intl.NumberFormat('es-ES', {
  maximumFractionDigits: 1,
  signDisplay: 'never',
  style: 'percent',
});

/**
 * Period-over-period change indicator. Colour reflects whether the change is good for the metric
 * (higher is better for clicks/impressions/CTR; lower is better for average position).
 */
export function DeltaBadge({
  current,
  previous,
  lowerIsBetter = false,
}: {
  current: number;
  previous: number | undefined;
  lowerIsBetter?: boolean;
}) {
  if (previous === undefined || previous === 0) {
    return null;
  }

  const change = (current - previous) / previous;
  const rounded = Math.round(change * 1000) / 1000;

  if (rounded === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-slate-400">
        <Minus size={12} aria-hidden="true" />
        0%
      </span>
    );
  }

  const isIncrease = rounded > 0;
  const isGood = lowerIsBetter ? !isIncrease : isIncrease;
  const Icon = isIncrease ? ArrowUpRight : ArrowDownRight;

  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums ${
        isGood ? 'text-emerald-600' : 'text-rose-600'
      }`}
      title="Frente al periodo de comparación"
    >
      <Icon size={12} aria-hidden="true" />
      {PERCENT_FORMATTER.format(Math.abs(rounded))}
    </span>
  );
}
