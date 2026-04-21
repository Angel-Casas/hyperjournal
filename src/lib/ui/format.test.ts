import { describe, expect, it } from 'vitest';
import { formatCurrency, formatPercent, formatHoldTime, formatCompactCount } from './format';

describe('formatCurrency', () => {
  it('formats positive values with a leading sign marker', () => {
    expect(formatCurrency(1234.56)).toBe('+$1,234.56');
  });

  it('formats negative values with a minus sign', () => {
    expect(formatCurrency(-42.5)).toBe('-$42.50');
  });

  it('formats zero without a sign', () => {
    expect(formatCurrency(0)).toBe('$0.00');
  });

  it('renders null as em-dash', () => {
    expect(formatCurrency(null)).toBe('—');
  });

  it('rounds to 2 decimals', () => {
    expect(formatCurrency(1.005)).toBe('+$1.01');
  });
});

describe('formatPercent', () => {
  it('formats fractions as percentages with one decimal', () => {
    expect(formatPercent(0.653)).toBe('65.3%');
  });

  it('renders null as em-dash', () => {
    expect(formatPercent(null)).toBe('—');
  });

  it('formats zero as 0.0%', () => {
    expect(formatPercent(0)).toBe('0.0%');
  });

  it('handles fractions above 1', () => {
    expect(formatPercent(2.5)).toBe('250.0%');
  });
});

describe('formatHoldTime', () => {
  it('formats seconds', () => {
    expect(formatHoldTime(30_000)).toBe('30s');
  });

  it('formats minutes', () => {
    expect(formatHoldTime(5 * 60_000)).toBe('5m');
  });

  it('formats hours', () => {
    expect(formatHoldTime(3 * 60 * 60_000)).toBe('3h');
  });

  it('formats days', () => {
    expect(formatHoldTime(2 * 24 * 60 * 60_000)).toBe('2d');
  });

  it('rounds down to the nearest whole unit', () => {
    expect(formatHoldTime(90 * 60_000)).toBe('1h');
  });

  it('renders null as em-dash', () => {
    expect(formatHoldTime(null)).toBe('—');
  });
});

describe('formatCompactCount', () => {
  it('formats small counts plainly', () => {
    expect(formatCompactCount(42)).toBe('42');
  });

  it('formats thousands with k suffix', () => {
    expect(formatCompactCount(1500)).toBe('1.5k');
    expect(formatCompactCount(42000)).toBe('42k');
  });

  it('formats millions with M suffix', () => {
    expect(formatCompactCount(1_500_000)).toBe('1.5M');
  });
});
