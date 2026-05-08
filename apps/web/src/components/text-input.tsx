import * as React from 'react';
import { useFieldShell } from './field-shell';
import { cn } from './utils';

type TextInputProps = React.ComponentProps<'input'> & { invalid?: boolean };

export function TextInput({
  className,
  invalid,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-required': ariaRequired,
  onKeyDown,
  required,
  ref,
  ...props
}: TextInputProps) {
  const field = useFieldShell();
  const effectiveInvalid = invalid ?? ariaInvalid ?? field?.invalid ?? false;
  const effectiveDescribedBy = ariaDescribedBy ?? field?.describedBy;
  const effectiveRequired = required ?? field?.required ?? undefined;
  const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (event) => {
    onKeyDown?.(event);
    if (
      !event.defaultPrevented &&
      event.shiftKey &&
      event.key.length === 1 &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.stopPropagation();
    }
  };

  return (
    <input
      ref={ref}
      required={effectiveRequired}
      aria-invalid={effectiveInvalid || undefined}
      aria-describedby={effectiveDescribedBy}
      aria-required={ariaRequired ?? (effectiveRequired ? true : undefined)}
      onKeyDown={handleKeyDown}
      {...props}
      className={cn(
        'app-text-input h-12 w-full rounded-lg border-2 bg-white px-4 text-sm font-medium text-slate-900 outline-none transition-colors placeholder:font-normal placeholder:text-slate-400 focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 disabled:opacity-70',
        effectiveInvalid
          ? 'border-rose-500 focus:border-rose-600'
          : 'border-slate-300 hover:border-slate-400 focus:border-brand-600',
        className,
      )}
    />
  );
}
