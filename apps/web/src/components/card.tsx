import * as React from 'react';
import { cn } from './utils';

/**
 * Surface primitive used for dashboard panels, audit sections and list
 * containers. Standardises border, radius, background and elevation so panels
 * stop drifting between rounded-2xl/shadow-sm and rounded-2xl/shadow-lg.
 */
export function Card({
  as: Component = 'div',
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLElement> & { as?: 'div' | 'section' | 'article' }) {
  return (
    <Component
      {...props}
      className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}
    >
      {children}
    </Component>
  );
}

/**
 * Header row inside a Card: an eyebrow-style label on the left and an optional
 * action (link/button) on the right.
 */
export function CardHeader({
  icon,
  title,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex items-center justify-between gap-3', className)}>
      <div className="flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-[0.18em] text-slate-500">
        {icon ? <span className="text-slate-400">{icon}</span> : null}
        {title}
      </div>
      {action ?? null}
    </div>
  );
}
