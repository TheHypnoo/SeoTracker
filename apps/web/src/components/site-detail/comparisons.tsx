import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { formatDisplayDate } from '#/lib/date-format';
import type { AuditRun, ComparisonDetail, ComparisonItem } from './types';

export function CompareAuditsPanel({
  audits,
  loading,
  onCompare,
}: {
  audits: AuditRun[];
  loading: boolean;
  onCompare: (fromId: string, toId: string) => void;
}) {
  const [manualFromId, setManualFromId] = useState('');
  const [manualToId, setManualToId] = useState('');
  const defaultToId = audits[0]?.id ?? '';
  const defaultFromId = audits.find((audit) => audit.id !== defaultToId)?.id ?? '';
  const fromId = manualFromId || defaultFromId;
  const toId = manualToId || defaultToId;
  const canCompare = audits.length >= 2 && fromId !== '' && toId !== '' && fromId !== toId;
  const options = audits.map((audit) => ({
    value: audit.id,
    label: `${formatDisplayDate(audit.finishedAt ?? audit.createdAt)} · ${audit.score ?? '--'}/100 · #${audit.id.slice(0, 8)}`,
  }));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Comparar auditorías</h2>
          <p className="text-xs text-slate-500">
            Elige dos auditorías completadas y revisa cambios de score, incidencias y regresiones.
          </p>
        </div>
        {audits.length >= 2 ? (
          <button
            type="button"
            onClick={() => onCompare(defaultFromId, defaultToId)}
            disabled={!defaultFromId || !defaultToId || defaultFromId === defaultToId}
            className="btn-secondary inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-60"
          >
            Última vs anterior
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : audits.length < 2 ? (
        <div className="mt-4 rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
          Necesitas al menos dos auditorías completadas para comparar. Las auditorías fallidas,
          en cola o en ejecución no se usan como base de comparativa.
        </div>
      ) : (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
          <SelectInput
            id="comparison-from"
            label="Base"
            value={fromId}
            onValueChange={setManualFromId}
            options={options.map((option) => ({
              ...option,
              disabled: option.value === toId,
            }))}
            triggerClassName="min-w-0"
          />
          <SelectInput
            id="comparison-to"
            label="Objetivo"
            value={toId}
            onValueChange={setManualToId}
            options={options.map((option) => ({
              ...option,
              disabled: option.value === fromId,
            }))}
            triggerClassName="min-w-0"
          />
          <button
            type="button"
            onClick={() => onCompare(fromId, toId)}
            disabled={!canCompare}
            className="inline-flex h-10 items-center justify-center rounded-md bg-slate-950 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Comparar selección
          </button>
        </div>
      )}
    </section>
  );
}

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
                      ? formatDisplayDate(item.baselineRun.createdAt)
                      : '--'}{' '}
                    →{' '}
                    {item.targetRun?.createdAt
                      ? formatDisplayDate(item.targetRun.createdAt)
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
