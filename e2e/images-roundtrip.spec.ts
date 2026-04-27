import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

// Valid 1×1 RGBA PNG (red opaque). 70 bytes, decodable by createImageBitmap.
const TINY_PNG_BYTES = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06,
  0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x44,
  0x41, 0x54, 0x78, 0x9c, 0x63, 0xf8, 0xcf, 0xc0, 0xf0, 0x1f, 0x00, 0x05, 0x00,
  0x01, 0xff, 0x89, 0x99, 0x3d, 0x1d, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e,
  0x44, 0xae, 0x42, 0x60, 0x82,
]);

async function openFirstTrade(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
  await page.getByRole('button', { name: /analyze/i }).click();
  await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
  const table = page.getByRole('table', { name: /trade history/i });
  await expect(table).toBeVisible();
  await table.getByRole('row').nth(1).click();
  await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}/t/`));
  await expect(page.getByRole('heading', { name: /^journal$/i })).toBeVisible();
}

// Paste-handler integration is unit-tested in
// src/features/journal/hooks/useImagePasteHandler.test.tsx; the synthetic
// ClipboardEvent path in Playwright is unreliable across Chromium versions
// (clipboardData is sometimes stripped from the constructor for security).
// E2E covers the file-picker path end-to-end and trusts the unit test for
// paste wiring.
test.describe('image round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('upload via file picker → reload → thumbnail persists', async ({
    page,
  }) => {
    await openFirstTrade(page);

    await page.setInputFiles('input[type=file][aria-label="Add image"]', {
      name: 'shot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BYTES),
    });

    await expect(page.getByRole('img')).toHaveCount(1);

    await page.reload();
    await expect(page.getByRole('img')).toHaveCount(1);
  });

  test('upload → delete → reload → gone', async ({ page }) => {
    await openFirstTrade(page);

    await page.setInputFiles('input[type=file][aria-label="Add image"]', {
      name: 'shot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BYTES),
    });
    await expect(page.getByRole('img')).toHaveCount(1);

    await page.getByRole('button', { name: /^remove image /i }).click();
    await expect(page.getByRole('img')).toHaveCount(0);

    await page.reload();
    await expect(page.getByRole('img')).toHaveCount(0);
  });

  test('rejects HEIC with the wrong-mime banner', async ({ page }) => {
    await openFirstTrade(page);

    await page.setInputFiles('input[type=file][aria-label="Add image"]', {
      name: 'phone.heic',
      mimeType: 'image/heic',
      buffer: Buffer.from([0, 0, 0, 0]),
    });

    await expect(
      page.getByText(/only PNG, JPEG, WebP, and GIF/i),
    ).toBeVisible();
    await expect(page.getByRole('img')).toHaveCount(0);
  });

  test('export → import round-trips images', async ({ page, browser }) => {
    // Upload first.
    await openFirstTrade(page);
    await page.setInputFiles('input[type=file][aria-label="Add image"]', {
      name: 'shot.png',
      mimeType: 'image/png',
      buffer: Buffer.from(TINY_PNG_BYTES),
    });
    await expect(page.getByRole('img')).toHaveCount(1);

    // Export.
    await page.goto('/settings');
    const downloadPromise = page.waitForEvent('download');
    await page.getByRole('button', { name: /export data/i }).click();
    const download = await downloadPromise;
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // Fresh context (cleared IndexedDB).
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await mockHyperliquid(freshPage);

    // Import.
    await freshPage.goto('/settings');
    await freshPage.getByLabel(/^import$/i).setInputFiles(downloadPath);
    await expect(freshPage.getByText(/will import/i)).toBeVisible();
    await freshPage.getByRole('button', { name: /^confirm import$/i }).click();
    await expect(freshPage.getByText(/import complete/i)).toBeVisible();

    // Navigate to the same trade and confirm the thumbnail comes back.
    await freshPage.goto('/');
    await expect(
      freshPage.getByText(TEST_ADDR, { exact: false }),
    ).toBeVisible();
    await freshPage.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await freshPage.getByRole('button', { name: /analyze/i }).click();
    await expect(freshPage).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
    await freshPage
      .getByRole('table', { name: /trade history/i })
      .getByRole('row')
      .nth(1)
      .click();
    await expect(freshPage.getByRole('img')).toHaveCount(1);

    await freshContext.close();
  });
});
