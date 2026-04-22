import { useState } from 'react';
import { buildExport } from '@domain/export/buildExport';
import { createExportRepo } from '@lib/storage/export-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import { Button } from '@lib/ui/components/button';

type Props = { db?: HyperJournalDb };

function todayYYYYMMDD(now: number): string {
  const d = new Date(now);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function triggerDownload(url: string, filename: string) {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function ExportPanel({ db = defaultDb }: Props) {
  const [includeCache, setIncludeCache] = useState(false);
  const [exporting, setExporting] = useState(false);

  async function onExport() {
    setExporting(true);
    try {
      const repo = createExportRepo(db);
      const snapshot = await repo.readSnapshot();
      const now = Date.now();
      const file = buildExport(snapshot, { includeCache, now });
      const blob = new Blob([JSON.stringify(file, null, 2)], {
        type: 'application/json',
      });
      const url = URL.createObjectURL(blob);
      triggerDownload(url, `hyperjournal-export-${todayYYYYMMDD(now)}.json`);
      // Revoke on next tick so the click event's download pickup completes.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Download all your saved wallets and settings as a single JSON file.
      </p>
      <label className="flex items-center gap-2 text-sm text-fg-base">
        <input
          type="checkbox"
          checked={includeCache}
          onChange={(e) => setIncludeCache(e.target.checked)}
          className="h-4 w-4 rounded border-border bg-bg-overlay text-accent ring-offset-bg-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2"
        />
        Include cached market data
      </label>
      <div>
        <Button variant="default" size="sm" onClick={onExport} disabled={exporting}>
          {exporting ? 'Exporting…' : 'Export data'}
        </Button>
      </div>
    </div>
  );
}
