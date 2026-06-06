import { Check, Download, type LucideIcon, Plus } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '#/components/badge';

import { DeltaBadge } from './delta-badge';
import { formatNumber, formatPercent, formatPosition } from './format';
import type { TopPerformanceRow } from './types';

export function MetricCard({
  label,
  value,
  icon: Icon,
  delta,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  delta?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
        <span className="grid size-6 place-items-center rounded-lg bg-brand-50 text-brand-600">
          <Icon size={13} aria-hidden="true" />
        </span>
        {label}
      </div>
      <div className="mt-2 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-black tabular-nums text-slate-950">{value}</span>
        {delta}
      </div>
    </div>
  );
}

export function TopList({
  title,
  rows,
  empty,
  valueFormatter = (value) => value,
  valuePrefix,
  icon: Icon,
  onTrack,
  trackedValues,
  onExport,
}: {
  title: string;
  rows: TopPerformanceRow[];
  empty: string;
  valueFormatter?: (value: string) => string;
  valuePrefix?: (value: string) => ReactNode;
  icon: LucideIcon;
  onTrack?: (value: string) => void;
  trackedValues?: Set<string>;
  onExport?: () => void;
}) {
  const maxClicks = Math.max(...rows.map((row) => row.clicks), 1);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-slate-500">
          <Icon size={14} className="text-brand-500" aria-hidden="true" />
          {title}
        </h3>
        <div className="flex items-center gap-2">
          {onExport && rows.length > 0 ? (
            <button
              type="button"
              onClick={onExport}
              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
            >
              <Download size={12} aria-hidden="true" />
              CSV
            </button>
          ) : null}
          {rows.length > 0 ? <Badge tone="neutral">{rows.length}</Badge> : null}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-sm text-slate-500">
          {empty}
        </p>
      ) : (
        <ol className="mt-3 space-y-2">
          {rows.map((row) => (
            <li key={row.value} className="rounded-xl border border-slate-100 bg-white px-3 py-2">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div
                    className="flex min-w-0 items-center gap-2 truncate text-xs font-bold text-slate-900"
                    title={row.value}
                  >
                    {valuePrefix ? valuePrefix(row.value) : null}
                    <span className="truncate">{valueFormatter(row.value)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-2 text-[11px] text-slate-500">
                    <span>{formatNumber(row.clicks)} clicks</span>
                    <span>{formatNumber(row.impressions)} impr.</span>
                    <span>{formatPercent(row.ctr)} CTR</span>
                    <span>{formatPosition(row.position)} pos.</span>
                  </div>
                </div>
                <span className="flex shrink-0 items-start gap-2">
                  {onTrack ? (
                    <TrackButton
                      value={row.value}
                      onTrack={onTrack}
                      tracked={trackedValues?.has(row.value) ?? false}
                    />
                  ) : null}
                  <span className="flex flex-col items-end gap-0.5">
                    <span className="text-xs font-black tabular-nums text-slate-900">
                      {formatNumber(row.clicks)}
                    </span>
                    {row.previousClicks !== undefined ? (
                      <DeltaBadge current={row.clicks} previous={row.previousClicks} />
                    ) : null}
                  </span>
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${Math.max((row.clicks / maxClicks) * 100, 6)}%` }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function TrackButton({
  value,
  tracked,
  onTrack,
}: {
  value: string;
  tracked: boolean;
  onTrack: (value: string) => void;
}) {
  if (tracked) {
    return (
      <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
        <Check size={12} aria-hidden="true" />
        Siguiendo
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onTrack(value)}
      className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-brand-200 hover:text-brand-700 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:outline-none"
      aria-label={`Seguir ${value}`}
    >
      <Plus size={12} aria-hidden="true" />
      Seguir
    </button>
  );
}
