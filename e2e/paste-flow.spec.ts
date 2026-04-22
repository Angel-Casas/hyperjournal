import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('paste → /w/:address smoke flow', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('renders the metrics grid + charts + history after pasting a wallet', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    // Wallet header chip
    await expect(page.getByText(TEST_ADDR, { exact: false })).toBeVisible();
    // Metrics grid — at least the Total PnL card
    await expect(page.getByText(/total pnl/i)).toBeVisible();
    // Equity curve section heading
    await expect(page.getByRole('heading', { name: /equity curve/i })).toBeVisible();
    // Calendar section heading
    await expect(page.getByRole('heading', { name: /p\/l calendar/i })).toBeVisible();
    // Trade history — the table landmark
    await expect(page.getByRole('table', { name: /trade history/i })).toBeVisible();
  });

  test('refresh button re-fetches', async ({ page }) => {
    let fetchCount = 0;
    await page.route('**/api.hyperliquid.xyz/info', async (route) => {
      fetchCount += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: '[]',
      });
    });

    await page.goto(`/w/${TEST_ADDR}`);
    await expect(page.getByText(TEST_ADDR, { exact: false })).toBeVisible();
    const initialCount = fetchCount;
    await page.getByRole('button', { name: /refresh wallet data/i }).click();
    // Wait for at least one more fetch to happen after the click
    await expect.poll(() => fetchCount).toBeGreaterThan(initialCount);
  });
});
