import * as React from 'react';
import { cn } from './utils';

interface FieldShellContextValue {
  id?: string;
  describedBy?: string;
  invalid: boolean;
  required: boolean;
}

const FieldShellContext = React.createContext<FieldShellContextValue | null>(null);

export function useFieldShell() {
  return React.useContext(FieldShellContext);
}

export function FieldShell({
  label,
  description,
  error,
  htmlFor,
  required,
  labelAdornment,
  children,
  className,
}: React.PropsWithChildren<{
  label?: React.ReactNode;
  description?: React.ReactNode;
  error?: React.ReactNode;
  htmlFor?: string;
  required?: boolean;
  labelAdornment?: React.ReactNode;
  className?: string;
}>) {
  const descriptionId = description && htmlFor ? `${htmlFor}-desc` : undefined;
  const errorId = error && htmlFor ? `${htmlFor}-err` : undefined;
  const describedBy = [descriptionId, errorId].filter(Boolean).join(' ') || undefined;

  const contextValue = React.useMemo<FieldShellContextValue>(
    () => ({
      describedBy,
      id: htmlFor,
      invalid: Boolean(error),
      required: Boolean(required),
    }),
    [htmlFor, describedBy, error, required],
  );

  const content = (
    <FieldShellContext.Provider value={contextValue}>
      {children}
      {description ? (
        <div id={descriptionId} className="mt-1.5 text-xs leading-5 text-slate-500">
          {description}
        </div>
      ) : null}
      {error ? (
        <div id={errorId} role="alert" className="mt-1.5 text-xs text-rose-600">
          {error}
        </div>
      ) : null}
    </FieldShellContext.Provider>
  );

  if (!label) {
    return <div className={className}>{content}</div>;
  }

  return (
    <div className={cn('block', className)}>
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <label htmlFor={htmlFor} className="text-sm font-semibold text-slate-800">
          {label}
          {required ? (
            <span className="ml-0.5 text-rose-500" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {labelAdornment ? <div className="text-xs">{labelAdornment}</div> : null}
      </div>
      {content}
    </div>
  );
}
