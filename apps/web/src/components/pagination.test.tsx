import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from './pagination';

describe(Pagination, () => {
  it('does not render when all items fit on one page', () => {
    const { container } = render(
      <Pagination total={10} offset={0} pageSize={10} onChange={vi.fn<(next: number) => void>()} />,
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders current range and emits bounded offsets', () => {
    const onChange = vi.fn<(next: number) => void>();
    render(
      <Pagination
        total={45}
        offset={20}
        pageSize={20}
        itemLabel="auditorías"
        onChange={onChange}
      />,
    );

    expect(screen.getByText('21-40 de 45 auditorías')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Página anterior' }));
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }));

    expect(onChange).toHaveBeenNthCalledWith(1, 0);
    expect(onChange).toHaveBeenNthCalledWith(2, 40);
  });

  it('disables previous and next controls at the list boundaries', () => {
    const { rerender } = render(
      <Pagination total={45} offset={0} pageSize={20} onChange={vi.fn<(next: number) => void>()} />,
    );

    expect(
      screen.getByRole('button', { name: 'Página anterior' }).hasAttribute('disabled'),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }).hasAttribute('disabled'),
    ).toBeFalsy();

    rerender(
      <Pagination
        total={45}
        offset={40}
        pageSize={20}
        onChange={vi.fn<(next: number) => void>()}
      />,
    );

    expect(
      screen.getByRole('button', { name: 'Página anterior' }).hasAttribute('disabled'),
    ).toBeFalsy();
    expect(
      screen.getByRole('button', { name: 'Página siguiente' }).hasAttribute('disabled'),
    ).toBeTruthy();
  });
});
