import { test, expect } from './fixtures';
import { safeGoto } from './e2e-utils';

/**
 * Epic 54 — cross-entity CRUD/detail smoke.
 *
 * One thin durable pass over the migrated surfaces. Per-entity specs
 * (`create-control-modal`, `control-edit-modal`, `evidence-upload-modal`,
 * `new-risk-modal`) already exercise the happy-paths in depth against
 * their own list pages; this spec is the cross-cutting canary that
 * verifies the Sheet-surface (which no per-entity spec tests) and the
 * `/new` redirect shims (which span Controls + Risks in one pass).
 *
 * Isolation: each `test()` runs against its own fresh, empty tenant via
 * the `isolatedTenant` fixture (see `./fixtures`). The control-panel test
 * mints its own control first — the tenant starts empty.
 */

test.describe('Epic 54 — CRUD/detail surfaces mount on demand', () => {
    test('Controls — clicking a control name opens the editable side panel', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;
        const uid = Date.now().toString(36);

        // The tenant starts empty — mint a control so the list has a row.
        await safeGoto(authedPage, `/t/${tenantSlug}/controls/new`);
        await authedPage.waitForSelector('#control-name-input', { timeout: 15000 });
        await authedPage.fill('#control-name-input', `E2E Smoke Control ${uid}`);
        await authedPage.fill('#control-code-input', `CTRL-${uid}`);
        await authedPage.click('#create-control-btn');
        await authedPage.waitForSelector('#control-title', { timeout: 15000 });

        await safeGoto(authedPage, `/t/${tenantSlug}/controls`);
        // One-click on a control NAME opens the editable side panel (replaces
        // the old quick-edit pencil + edit Sheet; no table blur, no edit btn).
        const title = authedPage.locator('[data-testid^="control-title-"]').first();
        await title.waitFor({ state: 'visible', timeout: 15000 });

        await title.click();

        // The panel is the EDIT surface (the edit form is present). `.first()`
        // because <AsidePanel> renders its content in BOTH the docked rail and
        // the Sheet body (openOnMount opens both) — the testid matches twice.
        await expect(authedPage.locator('[data-testid="control-edit-panel"]').first()).toBeVisible({
            timeout: 5000,
        });
        await expect(authedPage.locator('[data-testid="control-edit-form"]').first()).toBeVisible();

        // Escape closes the panel so no focus-trap leaks into the next test.
        await authedPage.keyboard.press('Escape');
    });

    test('Redirect shims — /controls/new and /risks/new open their modals', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;

        await safeGoto(authedPage, `/t/${tenantSlug}/controls/new`);
        await expect(authedPage.locator('#control-name-input')).toBeVisible({ timeout: 15000 });
        await expect(authedPage).toHaveURL(/\/controls(\?|$)/);

        await safeGoto(authedPage, `/t/${tenantSlug}/risks/new`);
        await expect(authedPage.locator('#risk-title')).toBeVisible({ timeout: 15000 });
        await expect(authedPage).toHaveURL(/\/risks(\?|$)/);
    });
});
