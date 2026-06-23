/**
 * E2E — search affordances (2026-05-30).
 *
 * Free-text search lives INSIDE the filter dropdown — there is NO
 * separate search bar on the page. Opening the Filter popover and typing
 * in its top input filters the table live (commits `q` to the URL, no
 * Enter). The global ⌘K palette remains the cross-entity search.
 *
 * Isolation: runs against its own fresh, empty tenant via the
 * `isolatedTenant` fixture (see `./fixtures`). This spec asserts only on
 * page CHROME — the Filter popover input, the `q` URL commit, the ⌘K
 * palette — none of which depend on the controls list having any rows, so
 * an empty tenant satisfies every assertion.
 */
import { test, expect } from './fixtures';
import { safeGoto } from './e2e-utils';

test.describe('Search affordances', () => {
    test('controls search lives inside the filter dropdown; ⌘K still opens', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;
        await safeGoto(authedPage, `/t/${tenantSlug}/controls`, {
            waitUntil: 'domcontentloaded',
        });
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        const main = authedPage.getByRole('main');

        // No standalone search bar on the page.
        await expect(main.locator('input[type="search"]')).toHaveCount(0);

        // Open the Filter dropdown — the live content search lives within.
        await main.locator('[data-filter-trigger]').first().click();
        const search = authedPage.locator('#controls-search input');
        await expect(search).toBeVisible();

        // Typing filters the table live — the query lands in the URL with
        // no Enter press.
        await search.fill('iso');
        await expect(authedPage).toHaveURL(/[?&]q=iso/, { timeout: 5000 });

        // Close the dropdown, then confirm ⌘K still opens the palette.
        await authedPage.keyboard.press('Escape');
        await authedPage.keyboard.press('Control+KeyK');
        await expect(
            authedPage.locator('[data-testid="command-palette-input"]'),
        ).toBeVisible({ timeout: 5000 });
    });
});
