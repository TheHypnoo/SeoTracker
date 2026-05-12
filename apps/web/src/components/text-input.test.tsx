import { fireEvent, render, screen } from '@testing-library/react';
import type { ChangeEventHandler, KeyboardEventHandler } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { TextInput } from './text-input';

describe(TextInput, () => {
  it('allows uppercase input from Shift + letter', () => {
    const onChange = vi.fn<ChangeEventHandler<HTMLInputElement>>();
    const parentKeyDown = vi.fn<KeyboardEventHandler<HTMLDivElement>>();
    render(
      <div role="presentation" onKeyDown={parentKeyDown}>
        <TextInput aria-label="Nombre del dominio" onChange={onChange} />
      </div>,
    );

    const input = screen.getByLabelText('Nombre del dominio') as HTMLInputElement;
    expect(fireEvent.keyDown(input, { code: 'KeyA', key: 'A', shiftKey: true })).toBeTruthy();
    fireEvent.change(input, { target: { value: 'A' } });

    expect(input.value).toBe('A');
    expect(onChange).toHaveBeenCalledOnce();
    expect(parentKeyDown).not.toHaveBeenCalled();
  });
});
