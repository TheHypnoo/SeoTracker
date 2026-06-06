import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { MetricItem, MetricTone } from './dashboard-types';

const METRIC_TONE_CLASS: Record<MetricTone, string> = {
  sky: 'bg-sky-50 text-sky-600',
  indigo: 'bg-indigo-50 text-indigo-600',
  emerald: 'bg-emerald-50 text-emerald-600',
  rose: 'bg-rose-50 text-rose-600',
  amber: 'bg-amber-50 text-amber-600',
  slate: 'bg-slate-100 text-slate-500',
};

function DeltaChip({ value, positiveIsGood = true }: NonNullable<MetricItem['delta']>) {
  if (value === 0) {
    return <span className="text-xs font-semibold text-slate-400">Sin cambios</span>;
  }
  const increased = value > 0;
  const good = increased === positiveIsGood;
  const Icon = increased ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-xs font-bold ${
        good ? 'text-emerald-600' : 'text-rose-600'
      }`}
    >
      <Icon size={13} aria-hidden="true" />
      {increased ? '+' : ''}
      {value}
    </span>
  );
}

export function MetricsPanel({ items }: { items: MetricItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:border-slate-300 hover:shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={`inline-flex h-8 w-8 items-center justify-center rounded-lg ${METRIC_TONE_CLASS[item.tone]}`}
            >
              {item.icon}
            </span>
            {item.delta ? <DeltaChip {...item.delta} /> : null}
          </div>
          <p className="mt-3 text-[0.7rem] font-semibold uppercase tracking-wide text-slate-500">
            {item.label}
          </p>
          <p className="mt-1 flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-slate-900">{item.value}</span>
            {item.suffix ? (
              <span className="text-xs font-semibold text-slate-400">{item.suffix}</span>
            ) : null}
          </p>
          {item.hint ? <p className="mt-1 text-xs text-slate-400">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
