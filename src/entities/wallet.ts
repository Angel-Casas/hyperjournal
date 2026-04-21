export type WalletAddress = string & { readonly __brand: 'WalletAddress' };

/**
 * A wallet the user has pasted and (optionally) saved locally. Persisted in
 * Dexie by Session 2b; shape locked here so callers across layers agree.
 */
export type Wallet = {
  readonly address: WalletAddress;
  readonly label: string | null;
  /**
   * Unix ms of the most recent visit to this wallet. Refreshed on every
   * navigation to `/w/:address` so the "Recent wallets" list naturally
   * sorts by last-viewed. Not a stable "first-added" timestamp.
   */
  readonly addedAt: number;
};
