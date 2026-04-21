import { describe, expect, it } from 'vitest';
import { isValidWalletAddress } from './isValidWalletAddress';

describe('isValidWalletAddress', () => {
  it('accepts a canonical lowercase 0x-prefixed 20-byte hex address', () => {
    expect(isValidWalletAddress('0xf318afb8f0050d140b5d1f58e9537f9ebfe82b14')).toBe(true);
  });

  it('accepts a mixed-case address (EIP-55 not enforced at this layer)', () => {
    expect(isValidWalletAddress('0xf318AFb8f0050D140B5D1F58E9537f9eBFE82B14')).toBe(true);
  });

  it('rejects the empty string', () => {
    expect(isValidWalletAddress('')).toBe(false);
  });

  it('rejects an address with no 0x prefix', () => {
    expect(isValidWalletAddress('f318afb8f0050d140b5d1f58e9537f9ebfe82b14')).toBe(false);
  });

  it('rejects an address that is too short', () => {
    expect(isValidWalletAddress('0x123')).toBe(false);
  });

  it('rejects an address that is too long', () => {
    expect(isValidWalletAddress('0xf318afb8f0050d140b5d1f58e9537f9ebfe82b1400')).toBe(false);
  });

  it('rejects an address with non-hex characters', () => {
    expect(isValidWalletAddress('0xf318afb8f0050d140b5d1f58e9537f9ebfe82Bzz')).toBe(false);
  });

  it('rejects non-string inputs (narrowed at type boundary, defensive here)', () => {
    expect(isValidWalletAddress(undefined as unknown as string)).toBe(false);
    expect(isValidWalletAddress(null as unknown as string)).toBe(false);
  });
});
