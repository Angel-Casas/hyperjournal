import type { Provenance } from './provenance';

/**
 * Mood the user was in during/after a trade. Trade-scope only.
 */
export type Mood =
  | 'calm'
  | 'confident'
  | 'anxious'
  | 'greedy'
  | 'regretful';

/**
 * Mindset during a trading session. Session-scope only. Parallel shape
 * to Mood (five curated enum values plus null), but different semantic
 * axis — mood is emotional, mindset is cognitive.
 */
export type Mindset =
  | 'focused'
  | 'scattered'
  | 'reactive'
  | 'patient'
  | 'tilted';

/**
 * Trade-scoped journal entry. Introduced in Session 7a.
 */
export type TradeJournalEntry = {
  readonly id: string;
  readonly scope: 'trade';
  readonly tradeId: string;
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly preTradeThesis: string;
  readonly postTradeReview: string;
  readonly lessonLearned: string;

  readonly mood: Mood | null;
  readonly planFollowed: boolean | null;
  readonly stopLossUsed: boolean | null;

  /**
   * UUID of a StrategyJournalEntry this trade is linked to, or null.
   * Introduced in Session 7d. Pre-7d rows may carry `undefined` in
   * storage; consumers treat `undefined` as `null` (see the form and
   * TradeDetail chip). Next upsert writes `null` explicitly.
   */
  readonly strategyId: string | null;

  /**
   * Free-form labels attached to this entry. Introduced in Session 7e.
   * Normalized (lowercase + trim + whitespace-collapsed) on save; see
   * `@lib/tags/normalizeTag`. Pre-7e rows may carry `undefined`;
   * consumers treat `undefined` as `[]`.
   */
  readonly tags: ReadonlyArray<string>;

  /**
   * UUIDs of attached JournalImage rows. Introduced in Session 7f.
   * Pre-7f rows may carry `undefined`; consumers treat `undefined` as
   * `[]`. Next upsert writes `[]` explicitly. Mirrors the 7e tags pattern.
   */
  readonly imageIds: ReadonlyArray<string>;

  readonly provenance: Provenance;
};

/**
 * Session/day-scoped journal entry. Introduced in Session 7b. Keyed by
 * a UTC YYYY-MM-DD date; one entry per date. Wallet-agnostic per plan
 * §11.8 — these fields describe the trader, not a specific wallet.
 */
export type SessionJournalEntry = {
  readonly id: string;
  readonly scope: 'session';
  readonly date: string; // YYYY-MM-DD (UTC)
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly marketConditions: string;
  readonly summary: string;
  readonly whatToRepeat: string;
  readonly whatToAvoid: string;

  readonly mindset: Mindset | null;
  readonly disciplineScore: number | null; // 1-5

  /**
   * Free-form labels attached to this entry. Same pool as trade/strategy
   * tags. See `@lib/tags/normalizeTag`.
   */
  readonly tags: ReadonlyArray<string>;

  /**
   * UUIDs of attached JournalImage rows. Introduced in Session 7f.
   * Pre-7f rows may carry `undefined`; consumers treat `undefined` as
   * `[]`. Mirrors the trade-scope pattern.
   */
  readonly imageIds: ReadonlyArray<string>;

  readonly provenance: Provenance;
};

/**
 * Strategy/setup-scoped journal entry. Introduced in Session 7c.
 * Wallet-agnostic (trader-level reference material — the setup belongs
 * to the trader, not to a specific wallet). Keyed by UUID so renaming
 * doesn't break any future cross-references.
 *
 * `name` is a regular content field the user can edit at any time. The
 * detail page heading reads the live name; blank names render as
 * "Untitled" but remain valid data.
 */
export type StrategyJournalEntry = {
  readonly id: string;
  readonly scope: 'strategy';
  readonly createdAt: number;
  readonly updatedAt: number;

  readonly name: string;
  readonly conditions: string;
  readonly invalidation: string;
  readonly idealRR: string; // free-form: "2:1", "2-3:1", "3R min"
  readonly examples: string;
  readonly recurringMistakes: string;
  readonly notes: string;

  /**
   * Free-form labels attached to this strategy. Same pool as trade and
   * session tags. See `@lib/tags/normalizeTag`.
   */
  readonly tags: ReadonlyArray<string>;

  /**
   * UUIDs of attached JournalImage rows. Introduced in Session 7f.
   * Pre-7f rows may carry `undefined`; consumers treat `undefined` as
   * `[]`. Mirrors the trade-scope pattern.
   */
  readonly imageIds: ReadonlyArray<string>;

  readonly provenance: Provenance;
};

/**
 * Discriminated union across all journal scopes. Narrow on `scope` to
 * access variant-specific fields. Session 7f added imageIds; cross-cut,
 * not per-variant.
 */
export type JournalEntry =
  | TradeJournalEntry
  | SessionJournalEntry
  | StrategyJournalEntry;
