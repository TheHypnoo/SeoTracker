import * as React from 'react';
import { cn } from './utils';

export function Skeleton({
  className,
  as: Component = 'div',
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { as?: 'div' | 'span' }) {
  return (
    <Component
      aria-hidden="true"
      {...props}
      className={cn('animate-pulse rounded-md bg-slate-200/70', className)}
    />
  );
}

/** Grid of stat-card placeholders matching MetricsPanel's layout. */
export function MetricsSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6" aria-hidden="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="rounded-xl border border-slate-200 bg-white p-4">
          <Skeleton className="h-8 w-8 rounded-lg" />
          <Skeleton className="mt-3 h-3 w-16" />
          <Skeleton className="mt-2 h-6 w-12" />
        </div>
      ))}
    </div>
  );
}

/** Table placeholder with a header row and body rows. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div
      className="overflow-hidden rounded-xl border border-slate-200"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex gap-4 bg-slate-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, index) => (
          <Skeleton key={index} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }).map((_row, rowIndex) => (
          <div key={rowIndex} className="flex gap-4 px-4 py-4">
            {Array.from({ length: cols }).map((_col, colIndex) => (
              <Skeleton key={colIndex} className="h-4 flex-1" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
