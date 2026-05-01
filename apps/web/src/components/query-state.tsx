import * as React from 'react';
import { Skeleton } from './skeleton';

export interface QueryStateProps<T> {
  status: 'pending' | 'error' | 'success';
  data: T | undefined;
  isEmpty?: (data: T) => boolean;
  error?: unknown;
  onRetry?: () => void;
  loading?: React.ReactNode;
  empty?: React.ReactNode;
  children: (data: T) => React.ReactNode;
}

export function QueryState<T>({
  status,
  data,
  isEmpty,
  error,
  onRetry,
  loading,
  empty,
  children,
}: QueryStateProps<T>) {
  if (status === 'pending') {
    return <>{loading ?? <Skeleton className="h-24 w-full" />}</>;
  }

  if (status === 'error') {
    const message = error instanceof Error ? error.message : 'Error inesperado.';
    return (
      <div
        role="alert"
        className="flex items-start justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
      >
        <span>{message}</span>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md bg-rose-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-rose-700 focus-visible:ring-2 focus-visible:ring-rose-500 focus-visible:outline-none"
          >
            Reintentar
          </button>
        ) : null}
      </div>
    );
  }

  if (data === undefined) {
    return null;
  }

  if (isEmpty?.(data)) {
    return <>{empty ?? null}</>;
  }

  return <>{children(data)}</>;
}
