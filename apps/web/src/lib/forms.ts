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
  // Object form: TanStack Form-like input. Always called with a stable form
  // object whose identity changes across renders, so the hook order is
  // deterministic — but we still need React to allow the conditional path.
  // The caller picks one signature and stays with it for the lifetime of
  // the component.
  if (typeof formOrCallback === 'function') {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      void formOrCallback();
    };
  }

  return useFormSubmitHandlerWithError(formOrCallback, options);
}

function useFormSubmitHandlerWithError(
  form: FormLike,
  options: { defaultErrorMessage?: string },
): SubmitHandlerWithError {
  const [error, setError] = useState<string | null>(null);
  const { defaultErrorMessage = 'No se pudo completar la acción' } = options;

  const onSubmit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      event.stopPropagation();
      setError(null);
      void Promise.resolve(form.handleSubmit()).catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : defaultErrorMessage);
      });
    },
    [form, defaultErrorMessage],
  );

  return { error, setError, onSubmit };
}
