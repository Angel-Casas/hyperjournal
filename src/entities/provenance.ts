/**
 * Classification for every user-visible field or metric. See plan.md §4.4.
 * - observed: came directly from a Hyperliquid response
 * - derived:  deterministic computation from observed values
 * - inferred: heuristic interpretation; expose uncertainty in the UI
 * - unknown:  not enough evidence to classify
 */
export type Provenance = 'observed' | 'derived' | 'inferred' | 'unknown';

/**
 * Wrap a value with its provenance. Use sparingly at boundaries where the
 * classification matters; internal pure functions can pass unwrapped data.
 */
export type Provenanced<T> = {
  readonly value: T;
  readonly provenance: Provenance;
};
