import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from './metric-card';

describe('MetricCard', () => {
  it('renders label and value', () => {
    render(<MetricCard label="Total PnL" value="+$1,234.56" />);
    expect(screen.getByText('Total PnL')).toBeInTheDocument();
    expect(screen.getByText('+$1,234.56')).toBeInTheDocument();
  });

  it('marks positive tone with the gain color class', () => {
    const { container } = render(<MetricCard label="PnL" value="+$100" tone="gain" />);
    expect(container.querySelector('.text-gain')).not.toBeNull();
  });

  it('marks negative tone with the loss color class', () => {
    const { container } = render(<MetricCard label="PnL" value="-$100" tone="loss" />);
    expect(container.querySelector('.text-loss')).not.toBeNull();
  });

  it('renders a provenance indicator when provenance is provided', () => {
    render(<MetricCard label="PnL" value="$0" provenance="derived" />);
    expect(screen.getByTitle(/derived/i)).toBeInTheDocument();
  });

  it('omits provenance dot when provenance prop is absent', () => {
    const { container } = render(<MetricCard label="PnL" value="$0" />);
    expect(container.querySelector('[data-provenance]')).toBeNull();
  });

  it('renders subtext when provided', () => {
    render(<MetricCard label="PnL" value="$0" subtext="per trade" />);
    expect(screen.getByText('per trade')).toBeInTheDocument();
  });
});
