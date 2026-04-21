import { z } from 'zod';
import type { WalletAddress } from '@entities/wallet';
import type { RawFill } from '@entities/fill';
import {
  ClearinghouseStateSchema,
  UserFillsResponseSchema,
  type ClearinghouseState,
} from '@lib/validation/hyperliquid';

const HL_INFO_URL = 'https://api.hyperliquid.xyz/info';

/**
 * Thrown on transport-level failures from the Hyperliquid /info endpoint.
 * Schema-validation failures bubble up as ZodError directly.
 */
export class HyperliquidApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: string,
  ) {
    super(message);
    this.name = 'HyperliquidApiError';
  }
}

/**
 * POST to Hyperliquid's /info endpoint with the given request body and
 * validate the response against the provided Zod schema. Throws
 * HyperliquidApiError for non-2xx responses and a ZodError for schema
 * mismatches. Both flow naturally into TanStack Query's error state.
 */
// z.ZodType<T, ZodTypeDef, unknown> lets the input side be unconstrained —
// required because schemas with NumericString transforms have string _input
// but number _output, so ZodType<T> (which defaults input=T) would conflict.
async function postInfo<T>(body: object, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const response = await fetch(HL_INFO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new HyperliquidApiError(
      `Hyperliquid /info returned ${response.status}`,
      response.status,
      text,
    );
  }
  const json = JSON.parse(text) as unknown;
  return schema.parse(json);
}

export function fetchUserFills(wallet: WalletAddress): Promise<RawFill[]> {
  return postInfo({ type: 'userFills', user: wallet }, UserFillsResponseSchema);
}

export function fetchClearinghouseState(wallet: WalletAddress): Promise<ClearinghouseState> {
  return postInfo({ type: 'clearinghouseState', user: wallet }, ClearinghouseStateSchema);
}
