const MISSING = '—';

/**
 * USDC currency with a sign marker for non-zero values. Null renders as
 * em-dash ("no data"); 0 renders as "$0.00" with no sign.
 */
export function formatCurrency(value: number | null): string {
  if (value === null) return MISSING;
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  if (value > 0) return `+$${formatted}`;
  if (value < 0) return `-$${formatted}`;
  return `$${formatted}`;
}

/**
 * Percentage with one decimal. Input is a fraction (0.65 → "65.0%").
 */
export function formatPercent(value: number | null): string {
  if (value === null) return MISSING;
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Hold duration as the largest fitting unit, rounded down. Input is ms.
 */
export function formatHoldTime(ms: number | null): string {
  if (ms === null) return MISSING;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

/**
 * Large integer counts compacted with k / M suffixes. < 1000 renders plain.
 */
export function formatCompactCount(value: number): string {
  if (value < 1000) return value.toString();
  if (value < 1_000_000) {
    const thousands = value / 1000;
    return thousands % 1 === 0 ? `${thousands}k` : `${thousands.toFixed(1)}k`;
  }
  const millions = value / 1_000_000;
  return millions % 1 === 0 ? `${millions}M` : `${millions.toFixed(1)}M`;
}
