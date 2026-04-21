import { z } from 'zod';
import type { RawFill } from '@entities/fill';

/**
 * Hyperliquid returns numeric quantities as JSON strings for precision.
 * All schemas coerce them to `number` at the boundary — downstream code
 * never sees the string-encoded form.
 */
const NumericString = z.string().transform((s, ctx) => {
  const n = Number(s);
  if (!Number.isFinite(n)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: `expected numeric string, got "${s}"` });
    return z.NEVER;
  }
  return n;
});

const Side = z.enum(['B', 'A']);

/**
 * One fill as returned by Hyperliquid's userFills endpoint.
 *
 * Shape observed in Task 2's live fixture fetch (see
 * tests/fixtures/hyperliquid/user-fills.json). Numeric-string fields are
 * coerced to number; side is constrained to B|A; twapId is nullable
 * (null when the fill is not part of a TWAP order). Unknown forward-
 * compat fields are stripped — if HL adds a field we care about, the
 * schema is updated explicitly and the entity `RawFill` widens to include
 * it. This keeps entities as the contract and validation as the verifier.
 */
export const FillSchema = z.object({
  coin: z.string().min(1),
  px: NumericString,
  sz: NumericString,
  side: Side,
  time: z.number().int().positive(),
  startPosition: NumericString,
  dir: z.string(),
  closedPnl: NumericString,
  hash: z.string(),
  oid: z.number().int().nonnegative(),
  crossed: z.boolean(),
  fee: NumericString,
  tid: z.number().int().nonnegative(),
  feeToken: z.string().min(1),
  twapId: z.number().int().nonnegative().nullable(),
});

export const UserFillsResponseSchema = z.array(FillSchema);

/**
 * Compile-time assertion: the schema's output shape must be assignable to
 * the entity's stable `RawFill` type, and vice versa. If Hyperliquid adds
 * a field we choose to expose, both must be updated in lockstep. Divergence
 * produces a `tsc --noEmit` error at this line.
 */
type _SchemaMatchesEntity = z.infer<typeof FillSchema> extends RawFill
  ? RawFill extends z.infer<typeof FillSchema>
    ? true
    : 'FillSchema is missing a field that RawFill declares'
  : 'FillSchema produces a field that RawFill does not declare';
const _schemaCheck: _SchemaMatchesEntity = true;
void _schemaCheck;

export type UserFillsResponse = z.infer<typeof UserFillsResponseSchema>;

const MarginSummarySchema = z.object({
  accountValue: NumericString,
  totalMarginUsed: NumericString,
  totalNtlPos: NumericString,
  totalRawUsd: NumericString,
});

const LeverageSchema = z.object({
  type: z.enum(['cross', 'isolated']),
  value: z.number().int().positive(),
});

const CumFundingSchema = z.object({
  allTime: NumericString,
  sinceOpen: NumericString,
  sinceChange: NumericString,
});

const PositionSchema = z.object({
  coin: z.string().min(1),
  szi: NumericString,
  entryPx: NumericString.nullable(),
  positionValue: NumericString,
  unrealizedPnl: NumericString,
  returnOnEquity: NumericString,
  leverage: LeverageSchema,
  liquidationPx: NumericString.nullable(),
  marginUsed: NumericString,
  maxLeverage: z.number().int().positive(),
  cumFunding: CumFundingSchema,
});

const AssetPositionSchema = z.object({
  position: PositionSchema,
  type: z.enum(['oneWay']),
});

/**
 * Account snapshot as returned by Hyperliquid's clearinghouseState endpoint.
 *
 * Shape observed in Task 2's live fixture fetch. `crossMaintenanceMarginUsed`
 * is top-level (not inside `crossMarginSummary`). entryPx and liquidationPx are
 * nullable. Forward-compat fields are stripped — when HL adds something we
 * want, update the schema explicitly.
 *
 * This type is consumed by features/* only, not by domain/, so it lives in
 * lib/validation rather than being promoted to an entity (per YAGNI).
 */
export const ClearinghouseStateSchema = z.object({
  assetPositions: z.array(AssetPositionSchema),
  marginSummary: MarginSummarySchema,
  crossMarginSummary: MarginSummarySchema,
  crossMaintenanceMarginUsed: NumericString,
  withdrawable: NumericString,
  time: z.number().int().positive(),
});

export type AssetPosition = z.infer<typeof AssetPositionSchema>;
export type ClearinghouseState = z.infer<typeof ClearinghouseStateSchema>;
