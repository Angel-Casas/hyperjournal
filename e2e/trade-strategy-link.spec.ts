import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('trade ↔ strategy link round-trip', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('create strategy → link from TradeJournalForm → chip appears → reload → persists', async ({
    page,
  }) => {
    // 1. Create a strategy via /strategies.
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();
    await expect(page).toHaveURL(/\/strategies$/);
    await page.getByLabel(/new strategy name/i).fill('E2E Setup');
    await page.getByRole('button', { name: /create/i }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);

    // 2. Navigate to the wallet and into a trade via the history table.
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
    const table = page.getByRole('table', { name: /trade history/i });
    await expect(table).toBeVisible();
    await table.getByRole('row').nth(1).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}/t/`));

    // 3. Pick the strategy from the picker.
    const picker = page.getByLabel(/^strategy$/i);
    await picker.selectOption({ label: 'E2E Setup' });
    // Tab away — Locator.blur() doesn't always fire React's synthetic onBlur.
    await picker.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();

    // 4. Chip appears in the header with the strategy name.
    const chip = page.getByRole('link', { name: /Strategy:\s*E2E Setup/i });
    await expect(chip).toBeVisible();

    // 5. Reload — selection + chip persist.
    await page.reload();
    await expect(page.getByLabel(/^strategy$/i)).toHaveValue(/[0-9a-f-]{36}/);
    await expect(
      page.getByRole('link', { name: /Strategy:\s*E2E Setup/i }),
    ).toBeVisible();

    // 6. Chip click navigates to /s/:id.
    await page.getByRole('link', { name: /Strategy:\s*E2E Setup/i }).click();
    await expect(page).toHaveURL(/\/s\/[0-9a-f-]{36}$/);
    await expect(page.getByRole('heading', { level: 1 })).toContainText('E2E Setup');
  });

  test('unlinking via "— no strategy" removes the chip', async ({ page }) => {
    // Seed: create a strategy, link a trade.
    await page.goto('/');
    await page.getByRole('link', { name: /strategies/i }).click();
    await page.getByLabel(/new strategy name/i).fill('To Unlink');
    await page.getByRole('button', { name: /create/i }).click();

    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    const table = page.getByRole('table', { name: /trade history/i });
    await table.getByRole('row').nth(1).click();

    const picker = page.getByLabel(/^strategy$/i);
    await picker.selectOption({ label: 'To Unlink' });
    await picker.press('Tab');
    await expect(page.getByText(/saved at/i)).toBeVisible();
    await expect(
      page.getByRole('link', { name: /Strategy:\s*To Unlink/i }),
    ).toBeVisible();

    // Unlink.
    await picker.selectOption('');
    await picker.press('Tab');
    await expect(
      page.getByRole('link', { name: /Strategy:\s*To Unlink/i }),
    ).toBeHidden();

    // Reload — still unlinked.
    await page.reload();
    await expect(page.getByLabel(/^strategy$/i)).toHaveValue('');
    await expect(
      page.getByRole('link', { name: /Strategy:\s*To Unlink/i }),
    ).toBeHidden();
  });
});
