import { useState, type FormEvent } from 'react';
import { Button } from '@lib/ui/components/button';
import { Input } from '@lib/ui/components/input';
import { Label } from '@lib/ui/components/label';
import { isValidWalletAddress } from '@domain/wallets/isValidWalletAddress';
import type { WalletAddress } from '@entities/wallet';

type Props = {
  onSubmit: (address: WalletAddress) => void;
};

export function WalletPaste({ onSubmit }: Props) {
  const [value, setValue] = useState('');
  const trimmed = value.trim();
  const valid = isValidWalletAddress(trimmed);
  const showError = trimmed.length > 0 && !valid;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!valid) return;
    onSubmit(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <Label htmlFor="wallet-address-input">Wallet address</Label>
      <Input
        id="wallet-address-input"
        type="text"
        placeholder="0x…"
        autoComplete="off"
        spellCheck={false}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        aria-invalid={showError}
        aria-describedby={showError ? 'wallet-address-error' : undefined}
        className="font-mono"
      />
      {showError && (
        <p id="wallet-address-error" className="text-xs text-loss">
          Enter a valid 0x-prefixed 20-byte address.
        </p>
      )}
      <Button type="submit" disabled={!valid}>
        Analyze
      </Button>
    </form>
  );
}
