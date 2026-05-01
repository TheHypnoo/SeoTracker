import * as React from 'react';
import { Switch } from '@base-ui/react';
import { cn } from './utils';

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled = false,
  className,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex items-start justify-between gap-4 rounded-lg border border-slate-200 px-4 py-4',
        className,
      )}
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold text-slate-900">{label}</div>
        {description ? (
          <div className="mt-1 text-sm leading-6 text-slate-500">{description}</div>
        ) : null}
      </div>
      <Switch.Root
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-label={typeof label === 'string' ? label : undefined}
        className="relative inline-flex h-7 w-12 shrink-0 rounded-full bg-slate-300 p-1 transition data-[checked]:bg-brand-500 data-[disabled]:opacity-50 focus-visible:ring-2 focus-visible:ring-brand-500 focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        <Switch.Thumb className="block size-5 rounded-full bg-white shadow-sm transition-transform data-[checked]:translate-x-5" />
      </Switch.Root>
    </div>
  );
}
