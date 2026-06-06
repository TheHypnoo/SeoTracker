import * as React from 'react';
import { cn } from './utils';

/**
 * Standard page header used across authenticated routes. Provides a consistent
 * eyebrow / title / description block on the left and an actions slot on the
 * right, replacing the ad-hoc `text-5xl font-black` headers scattered per page.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4', className)}>
      <div className="min-w-0">
        {eyebrow ? (
          <div className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-slate-500">
            {eyebrow}
          </div>
        ) : null}
        <h1 className="mt-1.5 text-3xl font-bold tracking-tight text-slate-900">{title}</h1>
        {description ? (
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2.5">{actions}</div> : null}
    </div>
  );
}
