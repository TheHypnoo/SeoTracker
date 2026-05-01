import type { ReactNode } from 'react';

export function KpiPill({
  icon,
  label,
  value,
  suffix,
  tone = 'text-slate-900',
}: {
  icon: ReactNode;
  label: string;
  value: string;
  suffix?: string;
  tone?: string;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        <span className="text-slate-400">{icon}</span>
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>
        {value}
        {suffix ? <span className="ml-0.5 text-xs text-slate-400">{suffix}</span> : null}
      </div>
    </div>
  );
}
