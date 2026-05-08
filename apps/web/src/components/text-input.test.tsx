import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { TextInput } from './text-input';

describe('TextInput', () => {
  it('allows uppercase input from Shift + letter', () => {
    const onChange = vi.fn();
    const parentKeyDown = vi.fn();
    render(
      <div role="presentation" onKeyDown={parentKeyDown}>
        <TextInput aria-label="Nombre del dominio" onChange={onChange} />
      </div>,
    );

    const input = screen.getByLabelText('Nombre del dominio') as HTMLInputElement;
    expect(fireEvent.keyDown(input, { code: 'KeyA', key: 'A', shiftKey: true })).toBe(true);
    fireEvent.change(input, { target: { value: 'A' } });

    expect(input.value).toBe('A');
    expect(onChange).toHaveBeenCalled();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});
