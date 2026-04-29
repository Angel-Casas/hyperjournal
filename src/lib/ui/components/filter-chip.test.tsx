import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FilterChip } from './filter-chip';

describe('FilterChip', () => {
  it('renders the label', () => {
    render(<FilterChip label="BTC" onRemove={() => {}} ariaLabel="Remove coin filter" />);
    expect(screen.getByText('BTC')).toBeInTheDocument();
  });

  it('calls onRemove when the X is clicked', async () => {
    const user = userEvent.setup();
    const onRemove = vi.fn();
    render(<FilterChip label="BTC" onRemove={onRemove} ariaLabel="Remove coin filter" />);
    await user.click(screen.getByRole('button', { name: /remove coin filter/i }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it('the X button has the supplied aria-label', () => {
    render(<FilterChip label="Long" onRemove={() => {}} ariaLabel="Remove side filter" />);
    expect(screen.getByRole('button', { name: 'Remove side filter' })).toBeInTheDocument();
  });
});
