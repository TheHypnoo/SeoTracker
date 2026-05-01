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
