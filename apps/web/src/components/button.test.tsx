import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Button } from './button';

describe(Button, () => {
  it('defaults to a safe non-submit button type', () => {
    render(<Button>Guardar</Button>);

    expect(screen.getByRole('button', { name: 'Guardar' }).getAttribute('type')).toBe('button');
  });

  it('disables interaction and exposes busy state while loading', () => {
    const onClick = vi.fn<() => void>();
    render(
      <Button loading onClick={onClick}>
        Guardar cambios
      </Button>,
    );

    const button = screen.getByRole('button', { name: 'Guardar cambios' });
    fireEvent.click(button);

    expect(button.hasAttribute('disabled')).toBeTruthy();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-disabled')).toBe('true');
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps explicit submit semantics for forms', () => {
    render(<Button type="submit">Enviar</Button>);

    expect(screen.getByRole('button', { name: 'Enviar' }).getAttribute('type')).toBe('submit');
  });
});
