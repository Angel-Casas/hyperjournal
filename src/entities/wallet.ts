export type WalletAddress = string & { readonly __brand: 'WalletAddress' };

/**
 * A wallet the user has pasted and (optionally) saved locally. Persisted in
 * Dexie by Session 2b; shape locked here so callers across layers agree.
 */
export type Wallet = {
  readonly address: WalletAddress;
  readonly label: string | null;
  /** Unix ms when the user first added this wallet locally. */
  readonly addedAt: number;
};
