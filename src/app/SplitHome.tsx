import { useNavigate } from 'react-router-dom';
import { AnalyticsPanel } from '@features/analytics';
import { JournalPanel } from '@features/journal';
import { WalletPaste, SavedWalletsList, useSavedWallets } from '@features/wallets';
import type { WalletAddress } from '@entities/wallet';

export function SplitHome() {
  const navigate = useNavigate();
  const { save } = useSavedWallets();

  function handlePaste(address: WalletAddress) {
    save.mutate(
      { address, label: null, addedAt: Date.now() },
      { onSuccess: () => navigate(`/w/${address}`) },
    );
  }

  return (
    <main className="grid h-[100dvh] grid-cols-1 gap-4 bg-bg-base p-4 md:grid-cols-2">
      <section className="flex h-full flex-col gap-4">
        <div className="rounded-lg border border-border bg-bg-raised p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg-base">Paste a wallet</h2>
          <WalletPaste onSubmit={handlePaste} />
        </div>
        <div className="flex-1 rounded-lg border border-border bg-bg-raised p-6">
          <h2 className="mb-4 text-lg font-semibold text-fg-base">Recent wallets</h2>
          <SavedWalletsList />
        </div>
      </section>
      <section className="flex h-full flex-col gap-4">
        <AnalyticsPanel />
        <JournalPanel />
      </section>
    </main>
  );
}
