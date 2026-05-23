/**
 * E2E — search affordances (quality roadmap P4, item 1).
 *
 * The R14-PR7 search-affordance kill sweep retired hand-rolled
 * `<input type="search">` on every tenant/org list page; the global
 * ⌘K command palette is the canonical cross-page search. The
 * structural guard `r14-no-page-searchbars.test.ts` pins the
 * source-level invariant; this spec pins the **observed user
 * behaviour**: the palette actually opens, and a representative
 * list page renders without a stray search input.
 */
import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

test.describe('Search affordances', () => {
    test('Ctrl+K opens the global command palette from a list page', async ({
        page,
    }) => {
        const tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`, {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForLoadState('networkidle').catch(() => {});

        // No rogue page-level <input type="search"> — the kill sweep
        // (R14-PR7) is supposed to keep search out of list pages.
        await expect(
            page.locator('input[type="search"]'),
        ).toHaveCount(0);

        // The palette IS the canonical search. ⌘K opens it.
        await page.keyboard.press('Control+KeyK');
        await expect(
            page.locator('[data-testid="command-palette-input"]'),
        ).toBeVisible({ timeout: 5000 });
    });
});
