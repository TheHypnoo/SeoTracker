import * as React from 'react';
import { useFieldShell } from './field-shell';
import { cn } from './utils';

export const TextInput = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }
>(function TextInput(
  {
    className,
    invalid,
    'aria-invalid': ariaInvalid,
    'aria-describedby': ariaDescribedBy,
    'aria-required': ariaRequired,
    required,
    ...props
  },
  ref,
) {
  const field = useFieldShell();
  const effectiveInvalid = invalid ?? ariaInvalid ?? field?.invalid ?? false;
  const effectiveDescribedBy = ariaDescribedBy ?? field?.describedBy;
  const effectiveRequired = required ?? field?.required ?? undefined;
  return (
    <input
      ref={ref}
      required={effectiveRequired}
      aria-invalid={effectiveInvalid || undefined}
      aria-describedby={effectiveDescribedBy}
      aria-required={ariaRequired ?? (effectiveRequired ? true : undefined)}
      {...props}
      className={cn(
        'w-full rounded-md border bg-white px-4 py-2.5 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-brand-500 focus-visible:ring-1 focus-visible:ring-brand-200 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-70',
        effectiveInvalid
          ? 'border-rose-400 focus:border-rose-500 focus-visible:ring-rose-200'
          : 'border-slate-200',
        className,
      )}
    />
  );
});
