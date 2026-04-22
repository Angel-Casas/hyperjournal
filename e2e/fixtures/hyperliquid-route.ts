import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const fixtureDir = resolve(here, '..', '..', 'tests', 'fixtures', 'hyperliquid');
const userFills = readFileSync(resolve(fixtureDir, 'user-fills.json'), 'utf8');

/**
 * Intercept HL /info POSTs. Returns the committed userFills fixture for
 * any `type: 'userFills'` request; other request types get a 400 so test
 * failures are loud.
 */
export async function mockHyperliquid(page: Page) {
  await page.route('**/api.hyperliquid.xyz/info', async (route) => {
    const postData = route.request().postDataJSON() as { type?: string } | null;
    if (postData?.type === 'userFills') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: userFills,
      });
      return;
    }
    await route.fulfill({
      status: 400,
      contentType: 'application/json',
      body: JSON.stringify({ error: `unexpected HL request type: ${postData?.type}` }),
    });
  });
}
