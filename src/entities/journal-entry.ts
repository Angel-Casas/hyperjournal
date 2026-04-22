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

  readonly provenance: Provenance;
};

/**
 * Discriminated union across all journal scopes. Narrow on `scope` to
 * access variant-specific fields. Sessions 7c/7d will extend this union
 * with 'strategy' and image-attachment variants.
 */
export type JournalEntry = TradeJournalEntry | SessionJournalEntry;
