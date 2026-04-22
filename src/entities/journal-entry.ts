import type { Provenance } from './provenance';

/**
 * Mood the user was in during/after the trade. Five curated enum values
 * (plus null for unset) rather than free text so Phase 4 AI and future
 * pattern detection can query against a stable vocabulary.
 */
export type Mood =
  | 'calm'
  | 'confident'
  | 'anxious'
  | 'greedy'
  | 'regretful';

/**
 * One journal entry. Session 7a supports trade-scope only; the scope
 * discriminator is present so 7b (session/day) and 7c (strategy) can
 * extend without reshaping the table.
 *
 * One entry per trade for the 'trade' scope — subsequent saves overwrite
 * the same row by `id`. The row is not created until the first non-empty
 * blur, so users who navigate into a trade without typing never produce
 * dead rows.
 */
export type JournalEntry = {
  readonly id: string; // UUID v4
  readonly scope: 'trade';
  readonly tradeId: string; // ReconstructedTrade.id ("${coin}-${tid}")
  readonly createdAt: number; // Unix ms
  readonly updatedAt: number; // Unix ms

  readonly preTradeThesis: string;
  readonly postTradeReview: string;
  readonly lessonLearned: string;

  readonly mood: Mood | null;
  readonly planFollowed: boolean | null; // tri-state; null = unanswered
  readonly stopLossUsed: boolean | null;

  readonly provenance: Provenance; // always 'observed' for user-authored entries
};
