import { ChevronDown } from 'lucide-react';
import type { ReactNode } from 'react';

export function CollapsibleSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3 text-sm font-semibold text-slate-800 hover:bg-slate-50">
        <span className="flex items-center gap-2">
          {title}
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
            {count}
          </span>
        </span>
        <ChevronDown
          size={16}
          className="shrink-0 text-slate-400 transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-slate-100 px-5 py-4">{children}</div>
    </details>
  );
}
