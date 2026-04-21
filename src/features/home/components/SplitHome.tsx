import { AnalyticsPanel } from '@features/analytics';
import { JournalPanel } from '@features/journal';

export function SplitHome() {
  return (
    <main className="grid h-[100dvh] grid-cols-1 gap-4 bg-bg-base p-4 md:grid-cols-2">
      <AnalyticsPanel />
      <JournalPanel />
    </main>
  );
}
