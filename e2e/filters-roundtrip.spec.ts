import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('filters round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('apply, propagate, share via URL', async ({ page, browser }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // Open the drawer; pick Long + Closed.
    await page.getByRole('button', { name: /^filters$/i }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
    await page.getByRole('radio', { name: 'Long' }).click();
    await page.getByRole('radio', { name: 'Closed' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Filters' })).not.toBeVisible();

    // URL reflects state.
    await expect(page).toHaveURL(/side=long/);
    await expect(page).toHaveURL(/status=closed/);

    // Open the URL in a fresh context — filter restored.
    const url = page.url();
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await mockHyperliquid(freshPage);
    await freshPage.goto(url);
    await expect(freshPage.getByRole('button', { name: /filters \(2 active\)/i })).toBeVisible();
    await freshContext.close();
  });

  test('empty result + clear all', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    // Apply a coin filter that no fixture trade matches via URL.
    await page.goto(`/w/${TEST_ADDR}?coin=NONEXISTENTCOIN`);
    await expect(page.getByText(/no trades match these filters/i)).toBeVisible();

    // Clear all from the empty-state action inside the trade-history region.
    await page
      .getByText(/no trades match these filters/i)
      .locator('..')
      .getByRole('button', { name: /clear all/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
  });

  test('custom date range persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    // Navigate directly via URL (faster than driving the date inputs).
    await page.goto(`/w/${TEST_ADDR}?from=2026-01-01&to=2026-04-28`);
    await expect(page.getByText('2026-01-01 – 2026-04-28')).toBeVisible();

    await page.reload();
    await expect(page.getByText('2026-01-01 – 2026-04-28')).toBeVisible();
  });
});
