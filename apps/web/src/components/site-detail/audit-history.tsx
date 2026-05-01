import { Link } from '@tanstack/react-router';
import { ArrowRight, FileDown } from 'lucide-react';
import { Pagination } from '#/components/pagination';
import { SelectInput } from '#/components/select-input';
import { Skeleton } from '#/components/skeleton';
import { scoreBg, scoreTone, statusLabel, statusTone, triggerLabel } from './helpers';
import type { AuditRun } from './types';

export function AuditHistoryList({
  siteId,
  audits,
  loading,
  statusFilter,
  triggerFilter,
  total,
  offset,
  pageSize,
  onStatusChange,
  onTriggerChange,
  onPageChange,
  onCompare,
  onCreateExport,
}: {
  siteId: string;
  audits: AuditRun[];
  loading: boolean;
  statusFilter: string;
  triggerFilter: string;
  total: number;
  offset: number;
  pageSize: number;
  onStatusChange: (value: string) => void;
  onTriggerChange: (value: string) => void;
  onPageChange: (next: number) => void;
  onCompare: (fromId: string, toId: string) => void;
  onCreateExport: (auditRunId: string) => void;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Historial</h2>
          <p className="text-xs text-slate-500">Últimas auditorías ejecutadas en este dominio.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SelectInput
            value={statusFilter}
            onValueChange={onStatusChange}
            placeholder="Estado"
            triggerClassName="min-w-36 py-1.5 text-xs"
            options={[
              { label: 'Todos', value: '' },
              { label: 'Completado', value: 'COMPLETED' },
              { label: 'Ejecutando', value: 'RUNNING' },
              { label: 'Error', value: 'FAILED' },
              { label: 'En cola', value: 'QUEUED' },
            ]}
          />
          <SelectInput
            value={triggerFilter}
            onValueChange={onTriggerChange}
            placeholder="Disparador"
            triggerClassName="min-w-36 py-1.5 text-xs"
            options={[
              { label: 'Todos', value: '' },
              { label: 'Manual', value: 'MANUAL' },
              { label: 'Programada', value: 'SCHEDULED' },
              { label: 'Webhook', value: 'WEBHOOK' },
            ]}
          />
        </div>
      </div>

      <ul className="mt-4 divide-y divide-slate-100" aria-busy={loading || undefined}>
        {loading
          ? ['a1', 'a2', 'a3'].map((slot) => (
              <li key={slot} className="py-3">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="mt-2 h-3 w-1/3" />
              </li>
            ))
          : null}
        {!loading && audits.length === 0 ? (
          <li className="py-8 text-center text-sm text-slate-500">
            Todavía no se ha ejecutado ninguna auditoría.
          </li>
        ) : null}
        {audits.map((audit, index) => {
          const previousAudit = audits[index + 1] ?? null;
          return (
            <li key={audit.id} className="py-3">
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className={`inline-flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg ${scoreBg(audit.score)}`}
                >
                  <span className={`text-sm font-bold ${scoreTone(audit.score)}`}>
                    {audit.score ?? '--'}
                  </span>
                  <span className="text-[9px] font-medium uppercase tracking-wider text-slate-400">
                    score
                  </span>
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${statusTone(audit.status)}`}
                    >
                      {statusLabel(audit.status)}
                    </span>
                    <span className="text-xs text-slate-500">{triggerLabel(audit.trigger)}</span>
                    {audit.criticalIssuesCount > 0 ? (
                      <span className="text-xs font-medium text-rose-600">
                        {audit.criticalIssuesCount} críticas
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {new Date(audit.createdAt).toLocaleString()} · #{audit.id.slice(0, 8)} ·{' '}
                    {audit.issuesCount} hallazgos
                  </div>
                </div>

                <div className="flex items-center gap-1 text-slate-500">
                  {previousAudit ? (
                    <button
                      type="button"
                      onClick={() => onCompare(previousAudit.id, audit.id)}
                      title="Comparar con la anterior"
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition hover:bg-slate-100 hover:text-slate-900"
                    >
                      <ArrowRight size={12} aria-hidden="true" />
                      Comparar
                    </button>
                  ) : null}
                  <Link
                    to="/sites/$id/audits/$auditId"
                    params={{ auditId: audit.id, id: siteId }}
                    className="inline-flex items-center rounded-md px-2 py-1 text-xs font-medium transition hover:bg-slate-100 hover:text-slate-900"
                    title="Ver detalle"
                  >
                    Detalle
                  </Link>
                  <button
                    type="button"
                    onClick={() => onCreateExport(audit.id)}
                    title="Descargar CSV de incidencias"
                    className="inline-flex items-center justify-center rounded-md p-1.5 transition hover:bg-slate-100 hover:text-slate-900"
                  >
                    <FileDown size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {total > pageSize ? (
        <div className="mt-4 flex justify-end">
          <Pagination
            total={total}
            offset={offset}
            pageSize={pageSize}
            onChange={onPageChange}
            itemLabel="auditorías"
          />
        </div>
      ) : null}
    </section>
  );
}
