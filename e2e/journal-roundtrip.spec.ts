import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('journal round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('types a note, blurs, reloads, and sees the note persist', async ({ page }) => {
    // 1. Land on /w/:address via the paste flow.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // 2. Click the first trade-history row.
    const table = page.getByRole('table', { name: /trade history/i });
    await expect(table).toBeVisible();
    const firstRow = table.getByRole('row').nth(1); // [0] is the header row
    await firstRow.click();

    // 3. Land on the trade-detail route.
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}/t/`));
    await expect(page.getByRole('heading', { name: /^journal$/i })).toBeVisible();

    // 4. Type into post-trade-review + blur.
    const postReview = page.getByLabel(/post-trade review/i);
    await postReview.fill('E2E journal test entry');
    await postReview.blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 5. Reload the page.
    await page.reload();

    // 6. The textarea still carries the content.
    await expect(page.getByLabel(/post-trade review/i)).toHaveValue('E2E journal test entry');
  });

  test('pencil icon appears on the history row after a note is saved', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    // Seed an entry via the UI.
    const firstRow = page.getByRole('table', { name: /trade history/i }).getByRole('row').nth(1);
    await firstRow.click();
    await page.getByLabel(/post-trade review/i).fill('seed');
    await page.getByLabel(/post-trade review/i).blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // Back to the wallet view.
    await page.getByRole('link', { name: /back/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // Pencil icon should now show on that row.
    const rowWithNote = page
      .getByRole('table', { name: /trade history/i })
      .getByRole('row')
      .nth(1);
    await expect(rowWithNote.getByLabel(/has journal notes/i)).toBeVisible();
  });
});
