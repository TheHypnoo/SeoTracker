import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  createSubmitHandler,
  displayFormError,
  firstFormError,
  useFormSubmitHandler,
} from './forms';

describe('form helpers', () => {
  it('normalizes first errors without showing empty states', () => {
    expect(firstFormError(undefined)).toBeUndefined();
    expect(firstFormError([])).toBeUndefined();
    expect(firstFormError([new Error('Email requerido')])).toBe('Email requerido');
    expect(firstFormError(['Demasiado corto'])).toBe('Demasiado corto');
  });

  it('only displays field errors after interaction or a submit attempt', () => {
    const untouchedField = {
      state: { meta: { errors: ['Dominio requerido'], isBlurred: false, isTouched: false } },
    };
    const blurredField = {
      state: { meta: { errors: ['Dominio requerido'], isBlurred: true } },
    };
    const submittedField = {
      form: { state: { submissionAttempts: 1 } },
      state: { meta: { errors: ['Dominio requerido'] } },
    };

    expect(displayFormError(untouchedField)).toBeUndefined();
    expect(displayFormError(blurredField)).toBe('Dominio requerido');
    expect(displayFormError(submittedField)).toBe('Dominio requerido');
  });

  it('creates submit handlers that prevent native form submission', () => {
    const handleSubmit = vi.fn<() => void>();
    const event = {
      preventDefault: vi.fn<() => void>(),
      stopPropagation: vi.fn<() => void>(),
    };

    createSubmitHandler(handleSubmit)(event as unknown as React.FormEvent<HTMLFormElement>);

    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(event.stopPropagation).toHaveBeenCalledOnce();
    expect(handleSubmit).toHaveBeenCalledOnce();
  });

  it('captures async submit errors when used with a form object', async () => {
    function TestForm() {
      const { error, onSubmit } = useFormSubmitHandler(
        {
          handleSubmit: () => Promise.reject(new Error('No se pudo guardar')),
        },
        { defaultErrorMessage: 'Error genérico' },
      );

      return (
        <form onSubmit={onSubmit}>
          <button type="submit">Guardar</button>
          {error ? <p role="alert">{error}</p> : null}
        </form>
      );
    }

    render(<TestForm />);
    fireEvent.submit(screen.getByRole('button', { name: 'Guardar' }));

    await waitFor(() => {
      expect(screen.getByRole('alert').textContent).toBe('No se pudo guardar');
    });
  });
});
