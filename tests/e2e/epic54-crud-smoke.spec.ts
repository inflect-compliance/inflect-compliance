import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

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
 * We deliberately keep this short — running the per-entity scenarios
 * here as well was flaky under serial mode because multiple describe
 * blocks in the same browser context left Radix/Vaul focus-trap state
 * attached to `body`, and the duplicate coverage added no signal.
 */

test.describe('Epic 54 — CRUD/detail surfaces mount on demand', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('Controls — clicking a control name opens the editable side panel', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        // One-click on a control NAME opens the editable side panel (replaces
        // the old quick-edit pencil + edit Sheet; no table blur, no edit btn).
        const title = page.locator('[data-testid^="control-title-"]').first();
        await title.waitFor({ state: 'visible', timeout: 15000 });

        await title.click();

        // The panel is the EDIT surface (the edit form is present).
        await expect(page.locator('[data-testid="control-edit-panel"]')).toBeVisible({
            timeout: 5000,
        });
        await expect(page.locator('[data-testid="control-edit-form"]')).toBeVisible();

        // Escape closes the panel so no focus-trap leaks into the next test.
        await page.keyboard.press('Escape');
    });

    test('Redirect shims — /controls/new and /risks/new open their modals', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        await safeGoto(page, `/t/${tenantSlug}/controls/new`);
        await expect(page.locator('#control-name-input')).toBeVisible({ timeout: 15000 });
        await expect(page).toHaveURL(/\/controls(\?|$)/);

        await safeGoto(page, `/t/${tenantSlug}/risks/new`);
        await expect(page.locator('#risk-title')).toBeVisible({ timeout: 15000 });
        await expect(page).toHaveURL(/\/risks(\?|$)/);
    });
});
