import * as React from 'react';
import { cn } from './utils';

const NOTICE_TONES = {
  danger: 'border-rose-200 bg-rose-50 text-rose-700',
  neutral: 'border-slate-200 bg-slate-50 text-slate-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
};

export function Notice({
  children,
  className,
  tone = 'neutral',
  role,
}: React.PropsWithChildren<{
  className?: string;
  tone?: 'neutral' | 'success' | 'warning' | 'danger';
  role?: 'status' | 'alert';
}>) {
  const defaultRole = tone === 'danger' ? 'alert' : 'status';

  return (
    <div
      role={role ?? defaultRole}
      className={cn('rounded-md border px-4 py-3 text-sm', NOTICE_TONES[tone], className)}
    >
      {children}
    </div>
  );
}
