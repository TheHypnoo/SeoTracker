import * as React from 'react';
import { cn } from './utils';

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-slate-200 bg-white px-6 py-10 text-center',
        className,
      )}
    >
      {icon ? <div className="text-slate-400">{icon}</div> : null}
      <div className="text-base font-semibold text-slate-900">{title}</div>
      {description ? (
        <div className="max-w-md text-sm leading-6 text-slate-500">{description}</div>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
