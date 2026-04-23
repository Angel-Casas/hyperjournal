import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

test.describe('strategy journal round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('create → navigate to /s/:id → edit → blur → reload → persist', async ({ page }) => {
    await page.goto('/');

    // 1. Navigate to /strategies via the JournalPanel link.
    await page.getByRole('link', { name: /strategies/i }).click();
    await expect(page).toHaveURL(/\/strategies$/);

    // 2. Create a new strategy.
    await page.getByLabel(/new strategy name/i).fill('E2E Breakout');
    await page.getByRole('button', { name: /create/i }).click();

    // 3. Land on /s/:id.
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Breakout');

    // 4. Fill conditions + blur.
    const conditions = page.getByLabel(/conditions/i);
    await conditions.fill('clear resistance break with volume');
    await conditions.blur();
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 5. Reload the page.
    await page.reload();

    // 6. Content persists.
    await expect(page.getByLabel(/conditions/i)).toHaveValue('clear resistance break with volume');
  });

  test('new strategy appears in the /strategies list', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();

    await page.getByLabel(/new strategy name/i).fill('Mean Reversion');
    await page.getByRole('button', { name: /create/i }).click();

    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    await page.getByRole('link', { name: /back/i }).click();

    await expect(page).toHaveURL(/\/strategies$/);
    await expect(page.getByText(/mean reversion/i)).toBeVisible();
  });
});
