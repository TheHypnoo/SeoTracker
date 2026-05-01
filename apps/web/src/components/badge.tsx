import * as React from 'react';
import { cn } from './utils';

type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info';

const badgeToneClasses: Record<BadgeTone, string> = {
  brand: 'bg-brand-50 text-brand-500 ring-brand-200',
  danger: 'bg-rose-50 text-rose-700 ring-rose-200',
  info: 'bg-sky-50 text-sky-700 ring-sky-200',
  neutral: 'bg-slate-100 text-slate-700 ring-slate-200',
  success: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-amber-200',
};

export function Badge({
  children,
  tone = 'neutral',
  className,
}: React.PropsWithChildren<{ tone?: BadgeTone; className?: string }>) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
        badgeToneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
