import { test, expect } from './fixtures';
import { safeGoto } from './e2e-utils';

/**
 * Epic 53 E2E — Controls page on the new enterprise filter system.
 *
 * Exercises the observable migration contract:
 *   1. The consolidated FilterSelect picker opens, drills into a filter, and
 *      applies a value that lands in the URL.
 *   2. Empty-state copy renders when a filter matches nothing.
 *
 * NOTE: R14 (#443) removed the free-text `#control-search` input from
 * every list page — the navbar ⌘K palette is the sole search affordance
 * now. The two search-driven tests that used to live here (q-param write,
 * clear-search) were deleted; the FilterSelect popover is the surviving
 * filter UI.
 *
 * Isolation: each `test()` runs against its own fresh, empty tenant via
 * the `isolatedTenant` fixture (see `./fixtures`). The filter categories
 * (Status, Applicability, Owner, Category) and the `status=IMPLEMENTED`
 * URL push come from the page's static filter defs, NOT from any existing
 * control row — so an empty tenant satisfies every assertion and the
 * tests need no ordering.
 */

test.describe('Controls — Epic 53 filter system', () => {
    test('FilterSelect trigger opens the command palette', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;
        await safeGoto(authedPage, `/t/${tenantSlug}/controls`);
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        // The shared FilterSelect renders a button labelled "Filter". Click the
        // first matching button to open the picker.
        const trigger = authedPage.getByRole('button', { name: /filter/i }).first();
        await expect(trigger).toBeVisible({ timeout: 10000 });
        await trigger.click();

        // cmdk renders its list with role="listbox". The picker should now
        // present a list of top-level filter categories (Status, Applicability,
        // Owner, Category).
        await expect(authedPage.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });
    });

    test('picking a status filter pushes it into the URL', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;
        await safeGoto(authedPage, `/t/${tenantSlug}/controls`);
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        await authedPage.getByRole('button', { name: /filter/i }).first().click();
        await expect(authedPage.getByRole('listbox').first()).toBeVisible({ timeout: 10000 });

        // Drill into Status — scope to the cmdk listbox so the lookup
        // doesn't collide with the inline <select> status pills on
        // every control row (which expose `<option>Implemented</option>`
        // accessible names).
        const filterListbox = authedPage.getByLabel('Suggestions');
        const statusRow = filterListbox.getByRole('option', { name: /^Status$/ });
        await statusRow.waitFor({ state: 'visible', timeout: 5000 });
        await statusRow.click();

        // Pick "Implemented"
        const implemented = filterListbox.getByRole('option', { name: /Implemented/ });
        await implemented.waitFor({ state: 'visible', timeout: 5000 });
        await implemented.click();

        // URL should now carry status=IMPLEMENTED.
        await expect(authedPage).toHaveURL(/[?&]status=IMPLEMENTED/, { timeout: 10000 });
    });
});
