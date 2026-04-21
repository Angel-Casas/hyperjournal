import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import type { ReactNode } from 'react';
import { WalletPaste } from './WalletPaste';

const validAddr = '0x0000000000000000000000000000000000000001';

function renderWithRouter(ui: ReactNode, initial = '/') {
  return render(<MemoryRouter initialEntries={[initial]}>{ui}</MemoryRouter>);
}

describe('WalletPaste', () => {
  it('renders an address input and a disabled submit button initially', () => {
    renderWithRouter(<WalletPaste onSubmit={() => {}} />);
    expect(screen.getByLabelText(/wallet address/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /analyze/i })).toBeDisabled();
  });

  it('enables the submit button only when the input is a valid address', async () => {
    const user = userEvent.setup();
    renderWithRouter(<WalletPaste onSubmit={() => {}} />);
    const input = screen.getByLabelText(/wallet address/i);
    const button = screen.getByRole('button', { name: /analyze/i });

    await user.type(input, '0x123');
    expect(button).toBeDisabled();

    await user.clear(input);
    await user.type(input, validAddr);
    expect(button).toBeEnabled();
  });

  it('shows a validation message when the input is non-empty but invalid', async () => {
    const user = userEvent.setup();
    renderWithRouter(<WalletPaste onSubmit={() => {}} />);
    await user.type(screen.getByLabelText(/wallet address/i), '0xnot-valid');
    expect(
      await screen.findByText(/enter a valid 0x-prefixed 20-byte address/i),
    ).toBeInTheDocument();
  });

  it('calls onSubmit with the parsed address when the form submits', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithRouter(<WalletPaste onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/wallet address/i), validAddr);
    await user.click(screen.getByRole('button', { name: /analyze/i }));
    expect(onSubmit).toHaveBeenCalledWith(validAddr);
  });

  it('does not call onSubmit if the submit button is clicked with invalid input', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithRouter(<WalletPaste onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText(/wallet address/i), 'nope');
    const button = screen.getByRole('button', { name: /analyze/i });
    await user.click(button).catch(() => {});
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
