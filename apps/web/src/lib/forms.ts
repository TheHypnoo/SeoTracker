import { useCallback, useState } from 'react';
import type { FormEvent } from 'react';

export function firstFormError(errors: unknown[] | undefined) {
  const first = errors?.[0];
  if (!first) {
    return undefined;
  }

  if (first instanceof Error) {
    return first.message;
  }

  return String(first);
}

export function createSubmitHandler(handleSubmit: () => void | Promise<void>) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void handleSubmit();
  };
}

type FormLike = { handleSubmit: () => Promise<unknown> | unknown };

type SubmitHandler = (event: FormEvent<HTMLFormElement>) => void;

type SubmitHandlerWithError = {
  error: string | null;
  setError: (error: string | null) => void;
  onSubmit: SubmitHandler;
};

/**
 * Two shapes coexist across the codebase, both accepted here:
 *
 *   1. `useFormSubmitHandler(callback)` — returns a bare `onSubmit` handler.
 *      Callers manage their own local error state.
 *
 *   2. `useFormSubmitHandler(form, { defaultErrorMessage })` — pass a
 *      TanStack-Form-shaped object (`{ handleSubmit }`) and get back a
 *      `{ error, setError, onSubmit }` triple with auto error capture.
 *
 * The two patterns came from different feature branches; unifying them on
 * the next refactor pass is fine, but in the meantime both are supported.
 */
export function useFormSubmitHandler(handleSubmit: () => void | Promise<void>): SubmitHandler;
export function useFormSubmitHandler(
  form: FormLike,
  options?: { defaultErrorMessage?: string },
): SubmitHandlerWithError;
export function useFormSubmitHandler(
  formOrCallback: FormLike | (() => void | Promise<void>),
  options: { defaultErrorMessage?: string } = {},
): SubmitHandler | SubmitHandlerWithError {
  const [error, setError] = useState<string | null>(null);
  const { defaultErrorMessage = 'No se pudo completar la acción' } = options;
  const isCallback = typeof formOrCallback === 'function';

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();

      if (typeof formOrCallback === 'function') {
        void formOrCallback();
        return;
      }

      setError(null);
      void Promise.resolve(formOrCallback.handleSubmit()).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : defaultErrorMessage);
      });
    },
    [formOrCallback, defaultErrorMessage],
  );

  if (isCallback) {
    return onSubmit;
  }

  return { error, setError, onSubmit };
}
