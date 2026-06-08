import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FieldShell } from './field-shell';
import { TextInput } from './text-input';

describe(FieldShell, () => {
  it('wires label, description, error and required state into child controls', () => {
    render(
      <FieldShell
        label="Dominio"
        htmlFor="domain"
        description="Incluye el protocolo."
        error="El dominio no es válido"
        required
      >
        <TextInput id="domain" />
      </FieldShell>,
    );

    const input = screen.getByLabelText(/Dominio/) as HTMLInputElement;
    const describedBy = input.getAttribute('aria-describedby') ?? '';

    expect({
      invalid: input.getAttribute('aria-invalid'),
      required: input.getAttribute('aria-required'),
      requiredProperty: input.required,
    }).toStrictEqual({
      invalid: 'true',
      required: 'true',
      requiredProperty: true,
    });
    expect(describedBy.split(' ')).toStrictEqual(['domain-desc', 'domain-err']);
    expect(screen.getByText('Incluye el protocolo.')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toBe('El dominio no es válido');
  });
});
