import { describe, expect, it, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { PnlCalendarFallbackTable } from './PnlCalendarFallbackTable';
import type { PnlCalendarDay } from '@domain/metrics/buildPnlCalendar';

afterEach(() => cleanup());

const sample: PnlCalendarDay[] = [
  { date: '2026-01-01', pnl: 100.5, tradeCount: 3 },
  { date: '2026-01-02', pnl: -20, tradeCount: 1 },
];

describe('PnlCalendarFallbackTable', () => {
  it('renders a table with an accessible name describing the data', () => {
    render(<PnlCalendarFallbackTable days={sample} />);
    const table = screen.getByRole('table', { name: /daily profit and loss/i });
    expect(table).toBeInTheDocument();
  });

  it('renders one row per day with date, pnl, and trade count', () => {
    render(<PnlCalendarFallbackTable days={sample} />);
    expect(screen.getByText('2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('+$100.50')).toBeInTheDocument();
    expect(screen.getByText('-$20.00')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('1')).toBeInTheDocument();
  });

  it('has column headers Date, PnL, Trades', () => {
    render(<PnlCalendarFallbackTable days={sample} />);
    expect(screen.getByRole('columnheader', { name: /date/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /pnl/i })).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /trades/i })).toBeInTheDocument();
  });

  it('is sr-only (visually hidden)', () => {
    const { container } = render(<PnlCalendarFallbackTable days={sample} />);
    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('sr-only');
  });
});
