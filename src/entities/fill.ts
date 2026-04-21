/**
 * A single fill — the stable internal shape every layer above `lib/validation`
 * consumes. Defined here (not in validation) so that entities remains the
 * lower-level, dependency-free contract per CLAUDE.md §4. The Zod schema in
 * `lib/validation/hyperliquid.ts` is verified at compile time to produce this
 * exact shape; if Hyperliquid's wire format ever diverges, the schema breaks
 * there, not here.
 *
 * Numeric fields (`px`, `sz`, `fee`, `startPosition`, `closedPnl`) are real
 * `number`s after boundary coercion — consumers never see HL's string-encoded
 * form.
 */
export type RawFill = {
  readonly coin: string;
  readonly px: number;
  readonly sz: number;
  readonly side: 'B' | 'A';
  readonly time: number;
  readonly startPosition: number;
  readonly dir: string;
  readonly closedPnl: number;
  readonly hash: string;
  readonly oid: number;
  readonly crossed: boolean;
  readonly fee: number;
  readonly tid: number;
  readonly feeToken: string;
  readonly twapId: number | null;
};
