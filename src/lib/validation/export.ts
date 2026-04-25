import { z } from 'zod';
import type { ExportFile } from '@entities/export';
import type { WalletAddress } from '@entities/wallet';

// z.custom<WalletAddress> produces the branded string type directly so the
// _schemaCheck at the bottom of the file passes without widening the entity.
// The predicate is the real validator; the branded type is just assertion.
const WalletAddressSchema = z.custom<WalletAddress>(
  (v) => typeof v === 'string' && /^0x[0-9a-fA-F]{40}$/.test(v),
  { message: 'expected 0x-prefixed 40-hex-char address' },
);

const WalletSchema = z.object({
  address: WalletAddressSchema,
  label: z.string().nullable(),
  addedAt: z.number().int().nonnegative(),
});

const UserSettingsSchema = z
  .object({
    key: z.literal('singleton'),
    lastSelectedAddress: z.string().nullable(),
  })
  .nullable();

// RawFill here mirrors the shape from tests/fixtures/hyperliquid/user-fills.json.
// We accept numbers (post-coerce) because our own exports write post-coerce.
// Numeric-string tolerance would be needed if we ever imported a raw HL response
// directly — we don't.
const RawFillExportedSchema = z.object({
  coin: z.string().min(1),
  px: z.number(),
  sz: z.number(),
  side: z.enum(['B', 'A']),
  time: z.number().int().positive(),
  startPosition: z.number(),
  dir: z.string(),
  closedPnl: z.number(),
  hash: z.string(),
  oid: z.number().int().nonnegative(),
  crossed: z.boolean(),
  fee: z.number(),
  tid: z.number().int().nonnegative(),
  feeToken: z.string().min(1),
  twapId: z.number().int().nonnegative().nullable(),
});

const FillsCacheEntrySchema = z.object({
  address: WalletAddressSchema,
  fetchedAt: z.number().int().nonnegative(),
  fills: z.array(RawFillExportedSchema),
});

const MoodSchema = z
  .enum(['calm', 'confident', 'anxious', 'greedy', 'regretful'])
  .nullable();

const MindsetSchema = z
  .enum(['focused', 'scattered', 'reactive', 'patient', 'tilted'])
  .nullable();

const JournalImageExportSchema = z.object({
  id: z.string().min(1),
  dataUrl: z.string().regex(/^data:image\/(png|jpeg|webp|gif);base64,/),
  mime: z.enum(['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  bytes: z.number().int().positive(),
  createdAt: z.number().int().nonnegative(),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});

const TradeJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('trade'),
  tradeId: z.string().min(1),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  preTradeThesis: z.string(),
  postTradeReview: z.string(),
  lessonLearned: z.string(),
  mood: MoodSchema,
  planFollowed: z.boolean().nullable(),
  stopLossUsed: z.boolean().nullable(),
  strategyId: z.string().min(1).nullable().default(null),
  tags: z.array(z.string()).default([]),
  imageIds: z.array(z.string()).default([]),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});

const SessionJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('session'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  marketConditions: z.string(),
  summary: z.string(),
  whatToRepeat: z.string(),
  whatToAvoid: z.string(),
  mindset: MindsetSchema,
  disciplineScore: z.number().int().min(1).max(5).nullable(),
  tags: z.array(z.string()).default([]),
  imageIds: z.array(z.string()).default([]),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});

const StrategyJournalEntrySchema = z.object({
  id: z.string().min(1),
  scope: z.literal('strategy'),
  createdAt: z.number().int().nonnegative(),
  updatedAt: z.number().int().nonnegative(),
  name: z.string(),
  conditions: z.string(),
  invalidation: z.string(),
  idealRR: z.string(),
  examples: z.string(),
  recurringMistakes: z.string(),
  notes: z.string(),
  tags: z.array(z.string()).default([]),
  imageIds: z.array(z.string()).default([]),
  provenance: z.enum(['observed', 'derived', 'inferred', 'unknown']),
});

const JournalEntrySchema = z.discriminatedUnion('scope', [
  TradeJournalEntrySchema,
  SessionJournalEntrySchema,
  StrategyJournalEntrySchema,
]);

const ExportDataSchema = z.object({
  wallets: z.array(WalletSchema),
  userSettings: UserSettingsSchema,
  fillsCache: z.array(FillsCacheEntrySchema).optional(),
  journalEntries: z.array(JournalEntrySchema).optional(),
  images: z.array(JournalImageExportSchema).optional(),
});

export const ExportFileSchema = z.object({
  app: z.literal('HyperJournal'),
  formatVersion: z.literal(1),
  exportedAt: z.number().int().nonnegative(),
  data: ExportDataSchema,
});

/**
 * Parse a raw `unknown` (typically `JSON.parse` of a file's text) into a
 * typed ExportFile. Throws ZodError on any shape mismatch. Callers wrap
 * this in the Settings UI error-copy mapping.
 */
export function parseExport(raw: unknown) {
  return ExportFileSchema.parse(raw);
}

/**
 * Compile-time assertion: every field the schema produces must be
 * assignable to the corresponding field on the stable ExportFile entity.
 *
 * One-way (schema → entity) rather than mutual because the schema uses
 * `z.array(...)` (mutable), `.optional()` (`T | undefined`), etc. — all
 * of which widen the schema's output relative to the entity's tighter
 * readonly / exactOptionalPropertyTypes shape. The one-way check is
 * still load-bearing: if someone adds a field to the entity without
 * updating the schema, this line fails.
 */
type _SchemaFitsEntity = z.infer<typeof ExportFileSchema> extends ExportFile
  ? true
  : 'ExportFileSchema produces a field that ExportFile does not declare';
const _schemaCheck: _SchemaFitsEntity = true;
void _schemaCheck;
