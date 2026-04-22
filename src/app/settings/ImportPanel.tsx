import { useState, type ChangeEvent } from 'react';
import { parseExport } from '@lib/validation/export';
import { mergeImport } from '@domain/export/mergeImport';
import { createExportRepo } from '@lib/storage/export-repo';
import { createImportRepo } from '@lib/storage/import-repo';
import { db as defaultDb, type HyperJournalDb } from '@lib/storage/db';
import { Button } from '@lib/ui/components/button';
import type { MergeResult } from '@entities/export';
import { importErrorCopyFor } from './import-errors';

type Props = { db?: HyperJournalDb };

/**
 * FileReader-based text read. We don't use File.prototype.text() because
 * jsdom (our test environment) doesn't implement it; FileReader works in
 * every target browser and in jsdom, so one code path covers both.
 */
function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === 'string') resolve(result);
      else reject(new Error('FileReader returned non-string result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsText(file);
  });
}

type UiState =
  | { kind: 'idle' }
  | { kind: 'staged'; result: MergeResult }
  | { kind: 'committing' }
  | { kind: 'done' }
  | { kind: 'error'; heading: string };

export function ImportPanel({ db = defaultDb }: Props) {
  const [state, setState] = useState<UiState>({ kind: 'idle' });

  async function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Clear the input so selecting the same file twice in a row still fires change.
    e.target.value = '';
    if (!file) return;
    try {
      const text = await readFileAsText(file);
      const json: unknown = JSON.parse(text);
      const incoming = parseExport(json);
      const existing = await createExportRepo(db).readSnapshot();
      const result = mergeImport(existing, incoming);
      setState({ kind: 'staged', result });
    } catch (err) {
      setState({ kind: 'error', heading: importErrorCopyFor(err).heading });
    }
  }

  async function onConfirm() {
    if (state.kind !== 'staged') return;
    setState({ kind: 'committing' });
    try {
      await createImportRepo(db).applyMerge(state.result);
      setState({ kind: 'done' });
    } catch (err) {
      setState({ kind: 'error', heading: importErrorCopyFor(err).heading });
    }
  }

  function onCancel() {
    setState({ kind: 'idle' });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-fg-muted">
        Restore saved wallets and settings from a previous export.
      </p>

      <label className="flex flex-col gap-1 text-sm text-fg-base">
        <span className="text-fg-muted">Import</span>
        <input
          type="file"
          accept="application/json,.json"
          onChange={onFileChange}
          className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-bg-overlay file:px-3 file:py-1.5 file:text-fg-base hover:file:bg-bg-overlay/80"
        />
      </label>

      {state.kind === 'staged' && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-overlay p-3 text-sm">
          <p className="text-fg-base">
            Will import{' '}
            <span className="font-medium">
              {state.result.summary.walletsAdded + state.result.summary.walletsUpdated} wallet
              {state.result.summary.walletsAdded + state.result.summary.walletsUpdated === 1
                ? ''
                : 's'}
            </span>
            {state.result.summary.fillsCacheEntries > 0 ? (
              <>
                {' '}
                and{' '}
                <span className="font-medium">
                  {state.result.summary.fillsCacheEntries} cache entr
                  {state.result.summary.fillsCacheEntries === 1 ? 'y' : 'ies'}
                </span>
              </>
            ) : null}
            {state.result.summary.journalEntriesImported > 0 ? (
              <>
                {' '}
                and{' '}
                <span className="font-medium">
                  {state.result.summary.journalEntriesImported} journal entr
                  {state.result.summary.journalEntriesImported === 1 ? 'y' : 'ies'}
                </span>
              </>
            ) : null}
            {state.result.summary.userSettingsOverwritten ? '. Settings will be overwritten.' : '.'}
          </p>
          <div className="flex gap-2">
            <Button variant="default" size="sm" onClick={onConfirm}>
              Confirm import
            </Button>
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {state.kind === 'committing' && (
        <p className="text-sm text-fg-muted">Importing…</p>
      )}

      {state.kind === 'done' && (
        <p className="text-sm text-gain">Import complete. Data restored.</p>
      )}

      {state.kind === 'error' && (
        <div className="flex flex-col gap-2 rounded-md border border-border bg-bg-overlay p-3 text-sm">
          <p className="text-loss">{state.heading}</p>
          <div>
            <Button variant="ghost" size="sm" onClick={() => setState({ kind: 'idle' })}>
              Choose a different file
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
