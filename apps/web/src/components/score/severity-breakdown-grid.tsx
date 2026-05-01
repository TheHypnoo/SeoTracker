type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

const SEVERITY_STYLE: Record<
  Severity,
  { bar: string; surface: string; border: string; label: string; value: string }
> = {
  CRITICAL: {
    bar: 'bg-rose-500',
    border: 'border-rose-200',
    label: 'text-rose-700',
    surface: 'bg-rose-50',
    value: 'text-rose-600',
  },
  HIGH: {
    bar: 'bg-amber-500',
    border: 'border-amber-200',
    label: 'text-amber-700',
    surface: 'bg-amber-50',
    value: 'text-amber-600',
  },
  MEDIUM: {
    bar: 'bg-sky-500',
    border: 'border-sky-200',
    label: 'text-sky-700',
    surface: 'bg-sky-50',
    value: 'text-sky-600',
  },
  LOW: {
    bar: 'bg-slate-400',
    border: 'border-slate-200',
    label: 'text-slate-700',
    surface: 'bg-slate-50',
    value: 'text-slate-600',
  },
};

const SEVERITY_LABEL: Record<Severity, string> = {
  CRITICAL: 'Crítica',
  HIGH: 'Alta',
  LOW: 'Baja',
  MEDIUM: 'Media',
};

/**
 * 4-column grid of issue counts grouped by severity, with proportional bar.
 */
export function SeverityBreakdownGrid({
  counts,
  total,
}: {
  counts: Record<Severity, number>;
  total: number;
}) {
  const severities: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {severities.map((severity) => {
        const count = counts[severity] ?? 0;
        const tone = SEVERITY_STYLE[severity];
        const percent = total === 0 ? 0 : Math.round((count / total) * 100);
        return (
          <div
            key={severity}
            className={`flex items-center gap-3 rounded-lg border px-3 py-2 ${tone.border} ${tone.surface}`}
          >
            <div className={`text-xl font-bold tabular-nums ${tone.value}`}>{count}</div>
            <div className="min-w-0 flex-1">
              <div className={`text-xs font-medium ${tone.label}`}>{SEVERITY_LABEL[severity]}</div>
              <div className="mt-1 h-1 overflow-hidden rounded-full bg-white/60">
                <div className={`h-full ${tone.bar}`} style={{ width: `${percent}%` }} />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
