function tone(value: number) {
  if (value >= 85)
    return {
      bar: 'bg-emerald-500',
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-600',
    };
  if (value >= 65)
    return {
      bar: 'bg-amber-500',
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-600',
    };
  return { bar: 'bg-rose-500', bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-600' };
}

/**
 * 4-column grid of category scores with progress bar. Used by audit detail
 * and (future) any view that surfaces category breakdown.
 */
export function CategoryScoreGrid({
  scores,
  labels,
}: {
  scores: Record<string, number>;
  /** Optional human-readable label map (e.g. CONTENT → "Contenido"). */
  labels?: Record<string, string>;
}) {
  const entries = Object.entries(scores);
  if (entries.length === 0) {
    return null;
  }
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {entries.map(([category, value]) => {
        const t = tone(value);
        return (
          <div
            key={category}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${t.border} ${t.bg}`}
          >
            <div className={`text-xl font-bold tabular-nums ${t.text}`}>{value}</div>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-medium text-slate-700">
                {labels?.[category] ?? category}
              </div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/60">
                <div className={`h-full ${t.bar}`} style={{ width: `${value}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
