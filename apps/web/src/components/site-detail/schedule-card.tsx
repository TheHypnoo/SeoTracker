import { Clock3, Pencil } from 'lucide-react';
import { Skeleton } from '#/components/skeleton';

export function ScheduleCard({
  summary,
  onEdit,
  loading,
}: {
  summary: string;
  onEdit: () => void;
  loading: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Clock3 size={14} className="text-slate-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-slate-900">Programación</h3>
        </div>
        <button
          type="button"
          onClick={onEdit}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
        >
          <Pencil size={12} aria-hidden="true" />
          Editar
        </button>
      </div>
      <p className="mt-1.5 text-sm text-slate-600">
        {loading ? <Skeleton className="h-4 w-3/4" /> : summary}
      </p>
    </section>
  );
}
