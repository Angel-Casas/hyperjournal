import { useNavigate, Link } from 'react-router-dom';
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
      <div className="flex h-full flex-col gap-4">
        <section
          aria-labelledby="paste-heading"
          className="rounded-lg border border-border bg-bg-raised p-6"
        >
          <h2 id="paste-heading" className="mb-4 text-lg font-semibold text-fg-base">
            Paste a wallet
          </h2>
          <WalletPaste onSubmit={handlePaste} />
        </section>
        <section
          aria-labelledby="recent-heading"
          className="flex-1 rounded-lg border border-border bg-bg-raised p-6"
        >
          <h2 id="recent-heading" className="mb-4 text-lg font-semibold text-fg-base">
            Recent wallets
          </h2>
          <SavedWalletsList />
        </section>
      </div>
      <div className="flex h-full flex-col gap-4">
        <AnalyticsPanel />
        <JournalPanel />
      </div>
      <footer className="col-span-full flex justify-end pt-2">
        <Link
          to="/settings"
          className="rounded-md px-2 py-1 text-sm text-fg-muted underline ring-offset-bg-base hover:text-fg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        >
          Settings
        </Link>
      </footer>
    </main>
  );
}
