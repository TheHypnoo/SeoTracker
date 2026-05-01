import { ChevronLeft, ChevronRight } from 'lucide-react';

export function Pagination({
  total,
  offset,
  pageSize,
  onChange,
  itemLabel = 'elementos',
}: {
  total: number;
  offset: number;
  pageSize: number;
  onChange: (next: number) => void;
  /** What the items are called, used for the "X-Y de Z" label. */
  itemLabel?: string;
}) {
  if (total <= pageSize) {
    return null;
  }

  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + pageSize, total);
  const canPrev = offset > 0;
  const canNext = offset + pageSize < total;

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium tabular-nums text-slate-500">
        {start}-{end} de {total} {itemLabel}
      </span>
      <button
        type="button"
        disabled={!canPrev}
        onClick={() => onChange(Math.max(0, offset - pageSize))}
        aria-label="Página anterior"
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <ChevronLeft size={12} aria-hidden="true" />
        Anterior
      </button>
      <button
        type="button"
        disabled={!canNext}
        onClick={() => onChange(offset + pageSize)}
        aria-label="Página siguiente"
        className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-slate-300 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50"
      >
        Siguiente
        <ChevronRight size={12} aria-hidden="true" />
      </button>
    </div>
  );
}
