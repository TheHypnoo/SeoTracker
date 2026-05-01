import type { MetricItem, MetricTone } from './dashboard-types';

const METRIC_TONE_ICON: Record<MetricTone, string> = {
  sky: 'text-sky-600',
  indigo: 'text-indigo-600',
  emerald: 'text-emerald-600',
  rose: 'text-rose-600',
  amber: 'text-amber-600',
  slate: 'text-slate-500',
};

export function MetricsPanel({ items }: { items: MetricItem[] }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100 shadow-sm">
      <div className="grid grid-cols-2 gap-px md:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <div key={item.label} className="bg-white px-5 py-5">
            <div className="flex items-center gap-2">
              <span className={METRIC_TONE_ICON[item.tone]}>{item.icon}</span>
              <p className="text-[0.7rem] font-semibold tracking-wide text-slate-500 uppercase">
                {item.label}
              </p>
            </div>
            <p className="mt-2 flex items-baseline gap-1">
              <span className="text-3xl font-black tracking-tight text-slate-950">
                {item.value}
              </span>
              {item.suffix ? (
                <span className="text-xs font-semibold text-slate-400">{item.suffix}</span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </article>
  );
}
