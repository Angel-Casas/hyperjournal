import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('tags round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('trade tag round-trip: add → blur → reload → persists → remove', async ({
    page,
  }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}/t/`));

    const input = page.getByLabel(/^tags$/i);
    await input.fill('breakout');
    await input.press('Enter');
    await input.fill('revenge trade');
    await input.press('Enter');
    await input.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    await page.reload();
    await expect(page.getByText('breakout')).toBeVisible();
    await expect(page.getByText('revenge trade')).toBeVisible();

    // Remove breakout via its X.
    await page.getByRole('button', { name: 'Remove tag: breakout' }).click();
    await page.getByLabel(/^tags$/i).press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    await page.reload();
    await expect(page.getByText('revenge trade')).toBeVisible();
    await expect(page.getByText('breakout')).toBeHidden();
  });

  test('cross-variant autocomplete: strategy tag suggests on a trade', async ({
    page,
  }) => {
    // 1. Create a strategy with a tag.
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();
    await page.getByLabel(/new strategy name/i).fill('E2E Strategy');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    const stratTagInput = page.getByLabel(/^tags$/i);
    await stratTagInput.fill('e2e-pooled');
    await stratTagInput.press('Enter');
    await stratTagInput.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 2. Navigate to a trade.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();

    // 3. Type partial into the trade's tag input → suggestion appears.
    const tradeTagInput = page.getByLabel(/^tags$/i);
    await tradeTagInput.fill('e2e');
    await expect(page.getByRole('option', { name: 'e2e-pooled' })).toBeVisible();

    // 4. ArrowDown + Enter picks it.
    await tradeTagInput.press('ArrowDown');
    await tradeTagInput.press('Enter');
    await tradeTagInput.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 5. Reload — tag persists.
    await page.reload();
    await expect(page.getByText('e2e-pooled')).toBeVisible();
  });
});
