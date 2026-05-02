import { test, expect } from '@playwright/test';
import { mockHyperliquid } from './fixtures/hyperliquid-route';

const TEST_ADDR = '0x0000000000000000000000000000000000000001';

test.describe('8b multi-select filters', () => {
  test.beforeEach(async ({ page }) => {
    await mockHyperliquid(page);
  });

  test('apply hold + day-of-week, share URL, fresh context preserves selection', async ({
    page,
    browser,
  }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));

    await page.getByRole('button', { name: /^filters$/i }).click();
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();

    // Toggle hold-duration: scalp + intraday
    const holdGroup = page.getByRole('group', { name: /hold duration/i });
    await holdGroup.getByRole('button', { name: /^scalp$/i }).click();
    await holdGroup.getByRole('button', { name: /^intraday$/i }).click();

    // Toggle day-of-week: Mon + Tue
    const dowGroup = page.getByRole('group', { name: /day of week/i });
    await dowGroup.getByRole('button', { name: /^mon$/i }).click();
    await dowGroup.getByRole('button', { name: /^tue$/i }).click();

    // URL reflects canonical-order serialization. URLSearchParams encodes
    // the comma as %2C; the parser decodes it back.
    await expect(page).toHaveURL(/[?&]hold=scalp%2Cintraday/);
    await expect(page).toHaveURL(/[?&]dow=mon%2Ctue/);

    const sharedUrl = page.url();

    // Fresh context — open the same URL, drawer should reflect the selection
    const freshContext = await browser.newContext();
    const freshPage = await freshContext.newPage();
    await mockHyperliquid(freshPage);
    await freshPage.goto(sharedUrl);
    await freshPage.getByRole('button', { name: /^filters/i }).click();

    const freshHoldGroup = freshPage.getByRole('group', {
      name: /hold duration/i,
    });
    await expect(
      freshHoldGroup.getByRole('button', { name: /^scalp$/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      freshHoldGroup.getByRole('button', { name: /^intraday$/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    const freshDowGroup = freshPage.getByRole('group', {
      name: /day of week/i,
    });
    await expect(
      freshDowGroup.getByRole('button', { name: /^mon$/i }),
    ).toHaveAttribute('aria-pressed', 'true');
    await expect(
      freshDowGroup.getByRole('button', { name: /^tue$/i }),
    ).toHaveAttribute('aria-pressed', 'true');

    await freshContext.close();
  });

  test('multi-dim empty result + clear all', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel(/wallet address/i).fill(TEST_ADDR);
    await page.getByRole('button', { name: /analyze/i }).click();

    // Whale + scalp: combo that's guaranteed empty for the small-trade fixture.
    // size=whale alone would be empty; combining with hold=scalp exercises the
    // multi-dimension URL grammar and the empty-state path together.
    await page.goto(`/w/${TEST_ADDR}?size=whale&hold=scalp`);

    await expect(page.getByText(/no trades match these filters/i)).toBeVisible();
    await expect(page).toHaveURL(/[?&]size=whale/);
    await expect(page).toHaveURL(/[?&]hold=scalp/);

    // Clear all from the empty-state action inside the trade-history region.
    await page
      .getByText(/no trades match these filters/i)
      .locator('..')
      .getByRole('button', { name: /clear all/i })
      .click();
    await expect(page).toHaveURL(new RegExp(`/w/${TEST_ADDR}$`));
  });
});
