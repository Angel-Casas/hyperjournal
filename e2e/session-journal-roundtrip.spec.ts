import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

test.describe('session journal round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('click "today\'s journal", type, blur, reload, persist', async ({ page }) => {
    await page.goto('/');

    const cta = page.getByRole('link', { name: /today'?s journal/i });
    await cta.click();

    await expect(page).toHaveURL(/\/d\/\d{4}-\d{2}-\d{2}$/);
    await expect(page.getByRole('heading', { name: /^journal$/i })).toBeVisible();

    const summary = page.getByLabel(/summary of the day/i);
    await summary.fill('E2E session test entry');
    await summary.blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    await page.reload();

    await expect(page.getByLabel(/summary of the day/i)).toHaveValue('E2E session test entry');
  });

  test('session entry appears in the JournalPanel list after saving', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /today'?s journal/i }).click();

    await page.getByLabel(/summary of the day/i).fill('panel-listing teaser');
    await page.getByLabel(/summary of the day/i).blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    await page.getByRole('link', { name: /back/i }).click();
    await expect(page).toHaveURL(/\/$/);

    await expect(page.getByText(/panel-listing teaser/i)).toBeVisible();
  });
});
