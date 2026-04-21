import type { WalletAddress } from '@entities/wallet';

const WALLET_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;

export function isValidWalletAddress(input: string): input is WalletAddress {
  return typeof input === 'string' && WALLET_ADDRESS_PATTERN.test(input);
}
