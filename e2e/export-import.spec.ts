import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';
import { readFileSync } from 'node:fs';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('export → import round-trip', () => {
  test('exports data and re-imports it in a fresh browser context', async ({
    page,
    browser,
  }) => {
    await mockHyperliquid(page);

    // 1. Seed state: paste wallet so Dexie has a row.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page.getByText(TEST_ADDR, { exact: false })).toBeVisible();

    // 2. Navigate to Settings and export.
    await page.goto('/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export data/i }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // Sanity-check the exported file has our wallet.
    const fileText = readFileSync(downloadPath, 'utf8');
    const parsed = JSON.parse(fileText);
    expect(parsed.app).toBe('HyperJournal');
    expect(parsed.data.wallets).toHaveLength(1);
    expect(parsed.data.wallets[0].address).toBe(TEST_ADDR);

    // 3. Fresh browser context (cleared storage, cleared IndexedDB).
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await mockHyperliquid(freshPage);

    // Visit Settings in the fresh context and upload the downloaded file.
    await freshPage.goto('/settings');
    const fileInput = freshPage.getByLabel(/^import$/i);
    await fileInput.setInputFiles(downloadPath);

    // Confirm the import.
    await expect(freshPage.getByText(/will import/i)).toBeVisible();
    await freshPage.getByRole('button', { name: /^confirm import$/i }).click();
    await expect(freshPage.getByText(/import complete/i)).toBeVisible();

    // 4. Verify the wallet now appears on /.
    await freshPage.goto('/');
    await expect(freshPage.getByText(TEST_ADDR, { exact: false })).toBeVisible();

    await freshContext.close();
  });
});
