import * as React from 'react';
import { cn } from './utils';

export function Card({
  children,
  className,
  as: Component = 'section',
}: React.PropsWithChildren<{
  className?: string;
  as?: 'section' | 'article' | 'div';
}>) {
  return (
    <Component
      className={cn('rounded-xl border border-slate-200 bg-white p-6 shadow-sm', className)}
    >
      {children}
    </Component>
  );
}
