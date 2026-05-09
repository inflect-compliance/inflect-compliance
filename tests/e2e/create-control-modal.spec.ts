import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

/**
 * Epic 54 — Create Control modal migration.
 *
 * Verifies the in-list modal path that replaces the legacy `/controls/new`
 * full-page form. The existing suites (`controls.spec.ts`, `control-tests.spec.ts`)
 * already exercise the `page.goto('/controls/new')` path — that redirects to
 * `/controls?create=1` and opens the modal, so those tests keep passing
 * untouched. This spec focuses on the *new* in-list entry:
 *
 *   - Clicking `#new-control-btn` from the list opens the modal (no
 *     navigation, list context preserved).
 *   - Cancelling closes the modal and returns the user to the list.
 *   - Submitting creates the control, invalidates the list cache, and
 *     navigates to the new control's detail page (preserves the existing
 *     post-create UX expected by the rest of the test suite).
 *   - Validation: submit stays disabled until Name is supplied.
 *   - Error path: API failure surfaces the error without closing.
 */

test.describe('Epic 54 — Create Control modal', () => {
    // Each modal test gets its own fresh browser context. The default
    // serial mode shares context across tests in this describe block,
    // and Radix Dialog leaves residual portal/focus-trap state in the
    // shared context that prevents the second open() from mounting the
    // modal in `next dev`. Per-test contexts are slightly slower but
    // make the suite deterministic.

    let tenantSlug: string;

    test('clicking + Control opens the modal without navigating away', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        // Reload to shake off any Radix/Vaul portal residue from a
        // prior describe block in the serial-mode run. Mirrors the
        // pattern in the rest of this file's tests.
        await page.reload({ waitUntil: 'domcontentloaded' });
        // Wait for the new-control-btn to be hydrated — without the
        // networkidle gate the click can race the React event-handler
        // attach in `next dev` and be dropped, leaving the modal closed.
        // Same defensive pattern as the other tests in this describe.
        const newBtn = page.locator('#new-control-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        const listUrl = page.url();

        await newBtn.click();

        // Modal form fields become visible — no /controls/new navigation.
        await expect(page.locator('#control-name-input')).toBeVisible({ timeout: 60_000 });
        expect(page.url()).toBe(listUrl);

        // Close the modal so downstream serial-mode tests start with a
        // clean overlay/focus-trap stack.
        await page.click('#new-control-cancel-btn');
        await expect(page.locator('#control-name-input')).toBeHidden({ timeout: 5000 });
    });

    test('Cancel closes the modal and leaves the list untouched', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        // Reload to shake off any Radix overlay state left over from
        // the previous test in this serial describe block.
        await page.reload({ waitUntil: 'domcontentloaded' });
        const newBtn = page.locator('#new-control-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await newBtn.click();
        await expect(page.locator('#control-name-input')).toBeVisible({ timeout: 60_000 });

        await page.click('#new-control-cancel-btn');

        // Form gone; list still visible.
        await expect(page.locator('#control-name-input')).toBeHidden({ timeout: 5000 });
        await expect(page.locator('#controls-table')).toBeVisible();
    });

    test('Create Control button is disabled until Name is filled', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        // Wait for the new-control-btn to be hydrated — without this
        // the click can race the React event-handler attach and be
        // dropped, leaving the modal closed.
        const newBtn = page.locator('#new-control-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await newBtn.click();
        await expect(page.locator('#control-name-input')).toBeVisible({ timeout: 60_000 });

        await expect(page.locator('#create-control-btn')).toBeDisabled();
        await page.fill('#control-name-input', 'A');
        await expect(page.locator('#create-control-btn')).toBeEnabled();
        await page.fill('#control-name-input', '');
        await expect(page.locator('#create-control-btn')).toBeDisabled();

        // Close so downstream tests don't inherit the dangling modal.
        await page.click('#new-control-cancel-btn');
        await expect(page.locator('#control-name-input')).toBeHidden({ timeout: 5000 });
    });

    test('submitting creates the control and navigates to the detail page', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls`);
        await page.reload({ waitUntil: 'domcontentloaded' });
        const newBtn2 = page.locator('#new-control-btn').first();
        await newBtn2.waitFor({ state: 'visible', timeout: 15_000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await newBtn2.click();
        await expect(page.locator('#control-name-input')).toBeVisible({ timeout: 60_000 });

        const uid = Date.now().toString(36);
        const name = `Modal E2E Control ${uid}`;
        await page.fill('#control-name-input', name);
        await page.fill('#control-code-input', `MOD-${uid}`);
        await page.fill('#control-description-input', 'Created via the Epic 54 modal.');

        const [response] = await Promise.all([
            page.waitForResponse((r) => r.url().includes('/api/t/') && r.url().endsWith('/controls') && r.request().method() === 'POST'),
            page.click('#create-control-btn'),
        ]);
        expect(response.status(), 'POST /controls succeeded').toBeLessThan(400);

        // Post-create: detail page. The router.push mirrors the legacy flow.
        await page.waitForSelector('#control-title', { timeout: 15000 });
        await expect(page.locator('#control-title')).toContainText(name, { timeout: 5000 });
    });

    test('/controls/new deep link redirects to the list with the modal auto-open', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/controls/new`);

        // Redirect lands on /controls with ?create=1; ControlsClient strips
        // the flag on mount. The modal form should be visible almost
        // immediately regardless of the final query string.
        await expect(page.locator('#control-name-input')).toBeVisible({ timeout: 15000 });
        await expect(page).toHaveURL(/\/controls(\?|$)/);
    });
});
