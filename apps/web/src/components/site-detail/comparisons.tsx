import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import type { ComparisonDetail, ComparisonItem } from './types';

export function ComparisonsSection({
  items,
  onOpen,
}: {
  items: ComparisonItem[];
  onOpen: (fromId: string, toId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3"
      >
        <div className="text-left">
          <h2 className="text-sm font-semibold text-slate-900">
            Comparativas guardadas{' '}
            <span className="font-normal text-slate-500">({items.length})</span>
          </h2>
          <p className="text-xs text-slate-500">
            Pares de auditorías archivados para consultar cambios en el tiempo.
          </p>
        </div>
        {open ? (
          <ChevronDown size={14} className="text-slate-500" />
        ) : (
          <ChevronRight size={14} className="text-slate-500" />
        )}
      </button>
      {open ? (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => {
            const up = item.scoreDelta >= 0;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => onOpen(item.baselineAuditRunId, item.targetAuditRunId)}
                  className="w-full rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:border-slate-300 hover:bg-slate-50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={`text-sm font-semibold tabular-nums ${up ? 'text-emerald-600' : 'text-rose-600'}`}
                    >
                      {up ? '+' : ''}
                      {item.scoreDelta} pts
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      {item.regressionsCount} reg.
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-slate-500">
                    {item.baselineRun?.createdAt
                      ? new Date(item.baselineRun.createdAt).toLocaleDateString()
                      : '--'}{' '}
                    →{' '}
                    {item.targetRun?.createdAt
                      ? new Date(item.targetRun.createdAt).toLocaleDateString()
                      : '--'}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}

export function ComparisonDetailView({ data }: { data: ComparisonDetail }) {
  const up = data.delta.score >= 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MiniStat label="Anterior" value={String(data.from.run.score ?? '--')} />
        <MiniStat label="Actual" value={String(data.to.run.score ?? '--')} />
        <MiniStat
          label="Δ Score"
          value={`${up ? '+' : ''}${data.delta.score}`}
          tone={up ? 'text-emerald-600' : 'text-rose-600'}
        />
        <MiniStat
          label="Δ Incidencias"
          value={`${data.delta.issues >= 0 ? '+' : ''}${data.delta.issues}`}
          tone={data.delta.issues >= 0 ? 'text-rose-600' : 'text-emerald-600'}
        />
      </div>
      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          Cambios detectados
        </div>
        <ul className="mt-2 space-y-1.5">
          {data.changes.length === 0 ? (
            <li className="text-sm text-slate-500">Sin cambios persistidos.</li>
          ) : null}
          {data.changes.map((change) => (
            <li
              key={
                change.id ??
                `${change.changeType}-${change.title}-${change.severity ?? 'none'}-${change.delta ?? 'none'}`
              }
              className="rounded-md border border-slate-200 px-3 py-2"
            >
              <div className="text-sm font-medium text-slate-800">{change.title}</div>
              <div className="mt-0.5 text-[11px] uppercase tracking-wider text-slate-500">
                {change.changeType}
                {change.severity ? ` · ${change.severity}` : ''}
                {typeof change.delta === 'number'
                  ? ` · ${change.delta > 0 ? '+' : ''}${change.delta}`
                  : ''}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MiniStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className={`mt-0.5 text-lg font-bold tabular-nums ${tone ?? 'text-slate-900'}`}>
        {value}
      </div>
    </div>
  );
}
