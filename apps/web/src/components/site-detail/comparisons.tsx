import { useState } from 'react';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { formatDisplayDate } from '#/lib/date-format';
import type { AuditRun } from './types';

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
          Necesitas al menos dos auditorías completadas para comparar. Las auditorías fallidas, en
          cola o en ejecución no se usan como base de comparativa.
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
