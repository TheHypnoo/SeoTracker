import { ChevronDown, ChevronRight, Download, FileDown, RotateCcw } from 'lucide-react';
import { useState } from 'react';
import type { AuditRun, ComparisonItem, ExportPayload, ProjectExport } from './types';

export function ExportsCard({
  latestAudit,
  latestComparison,
  exports,
  onCreateExport,
  onDownload,
  onRetry,
}: {
  latestAudit: AuditRun | null;
  latestComparison: ComparisonItem | null;
  exports: ProjectExport[];
  onCreateExport: (payload: ExportPayload) => void;
  onDownload: (exp: ProjectExport) => void;
  onRetry?: (exp: ProjectExport) => void;
}) {
  const [open, setOpen] = useState(false);
  const recent = exports.slice(0, 3);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2">
        <Download size={14} className="text-slate-400" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-slate-900">Exportaciones</h3>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => onCreateExport({ kind: 'HISTORY' })}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
        >
          <FileDown size={12} />
          Histórico
        </button>
        {latestAudit ? (
          <button
            type="button"
            onClick={() => onCreateExport({ auditRunId: latestAudit.id, kind: 'METRICS' })}
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <FileDown size={12} />
            Métricas
          </button>
        ) : null}
        {latestComparison ? (
          <button
            type="button"
            onClick={() =>
              onCreateExport({ comparisonId: latestComparison.id, kind: 'COMPARISON' })
            }
            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
          >
            <FileDown size={12} />
            Comparativa
          </button>
        ) : null}
      </div>

      {recent.length > 0 ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="flex w-full items-center justify-between gap-2 text-xs font-medium text-slate-600 hover:text-slate-900"
          >
            <span>
              {exports.length} exportaci{exports.length === 1 ? 'ón' : 'ones'} generada
              {exports.length === 1 ? '' : 's'}
            </span>
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
          {open ? (
            <ul className="mt-2 space-y-1.5">
              {recent.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center justify-between gap-2 rounded-md border border-slate-200 bg-slate-50 px-2 py-1.5 text-xs"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {item.kind} · {item.format}
                    </div>
                    <div className="text-[10px] text-slate-500">
                      {new Date(item.createdAt).toLocaleString()}
                    </div>
                  </div>
                  {item.status === 'COMPLETED' ? (
                    <button
                      type="button"
                      onClick={() => onDownload(item)}
                      className="inline-flex items-center rounded-md bg-white px-2 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-brand-50 hover:text-brand-700"
                    >
                      Descargar
                    </button>
                  ) : item.status === 'FAILED' && onRetry ? (
                    <button
                      type="button"
                      onClick={() => onRetry(item)}
                      title="Reintentar"
                      className="inline-flex items-center gap-1 rounded-md border border-rose-200 bg-rose-50 px-2 py-1 text-[11px] font-medium text-rose-700 transition hover:bg-rose-100"
                    >
                      <RotateCcw size={10} aria-hidden="true" />
                      Reintentar
                    </button>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                      {item.status}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
