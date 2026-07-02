/**
 * Epic 54 — Create Control modal migration.
 *
 * Verifies the in-list modal path that replaces the legacy
 * `/controls/new` full-page form: clicking `#new-control-btn` opens
 * the modal without navigation, Cancel closes it, submit stays
 * disabled until Name is supplied, and a successful submit creates
 * the control + navigates to its detail page.
 *
 * Isolation: each `test()` runs on its own fresh, empty tenant via
 * the `isolatedTenant` fixture. The "submitting creates the
 * control" test writes a row that, on an isolated tenant, cannot
 * pollute the shared seeded tenant.
 *
 * All selectors use existing id attributes — no data-testid additions.
 */
import { test, expect } from './fixtures';
import { safeGoto } from './e2e-utils';

test.describe('Epic 54 — Create Control modal', () => {
    test('clicking + Control opens the modal without navigating away', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/controls`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        const newBtn = authedPage.locator('#new-control-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        const listUrl = authedPage.url();

        await newBtn.click();

        await expect(authedPage.locator('#control-name-input')).toBeVisible({
            timeout: 60_000,
        });
        expect(authedPage.url()).toBe(listUrl);

        await authedPage.click('#new-control-cancel-btn');
        await expect(authedPage.locator('#control-name-input')).toBeHidden({
            timeout: 5000,
        });
    });

    test('Cancel closes the modal and leaves the list untouched', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/controls`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        const newBtn = authedPage.locator('#new-control-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        await newBtn.click();
        await expect(authedPage.locator('#control-name-input')).toBeVisible({
            timeout: 60_000,
        });

        await authedPage.click('#new-control-cancel-btn');

        await expect(authedPage.locator('#control-name-input')).toBeHidden({
            timeout: 5000,
        });
        await expect(authedPage.locator('#controls-table')).toBeVisible();
    });

    test('Create Control button is disabled until Name is filled', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/controls`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        const newBtn = authedPage.locator('#new-control-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        await newBtn.click();
        await expect(authedPage.locator('#control-name-input')).toBeVisible({
            timeout: 60_000,
        });

        await expect(authedPage.locator('#create-control-btn')).toBeDisabled();
        await authedPage.fill('#control-name-input', 'A');
        await expect(authedPage.locator('#create-control-btn')).toBeEnabled();
        await authedPage.fill('#control-name-input', '');
        await expect(authedPage.locator('#create-control-btn')).toBeDisabled();

        await authedPage.click('#new-control-cancel-btn');
        await expect(authedPage.locator('#control-name-input')).toBeHidden({
            timeout: 5000,
        });
    });

    test('submitting creates the control and navigates to the detail page', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/controls`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        const newBtn = authedPage.locator('#new-control-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        await newBtn.click();
        await expect(authedPage.locator('#control-name-input')).toBeVisible({
            timeout: 60_000,
        });

        const uid = Date.now().toString(36);
        const name = `Modal E2E Control ${uid}`;
        await authedPage.fill('#control-name-input', name);
        await authedPage.fill('#control-code-input', `MOD-${uid}`);

        const [response] = await Promise.all([
            authedPage.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().endsWith('/controls') &&
                    r.request().method() === 'POST',
            ),
            authedPage.click('#create-control-btn'),
        ]);
        expect(response.status(), 'POST /controls succeeded').toBeLessThan(400);

        await authedPage.waitForSelector('#control-title', { timeout: 15000 });
        await expect(authedPage.locator('#control-title')).toContainText(name, {
            timeout: 5000,
        });
    });

    test('/controls/new deep link redirects to the list with the modal auto-open', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/controls/new`);

        await expect(authedPage.locator('#control-name-input')).toBeVisible({
            timeout: 15000,
        });
        await expect(authedPage).toHaveURL(/\/controls(\?|$)/);
    });
});
