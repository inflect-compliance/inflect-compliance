/**
 * Epic 54 — New Risk modal migration.
 *
 * Verifies the modal replaces the legacy `/risks/new` wizard without
 * breaking deep links. The `/risks/new` route is now a server
 * redirect shim → `/risks?create=1`, which RisksClient detects on
 * mount and opens the modal automatically.
 *
 * Isolation: each `test()` runs on its own fresh, empty tenant via
 * the `isolatedTenant` fixture. The "submitting creates the risk"
 * test writes a row — on an isolated tenant that write cannot
 * pollute the shared seeded tenant, and the "list refreshes"
 * assertion is unambiguous because the new risk is the only row.
 *
 * All selectors use existing id attributes — no data-testid additions.
 */
import { test, expect } from './fixtures';
import { safeGoto, waitForHydration } from './e2e-utils';

test.describe('Epic 54 — New Risk modal', () => {
    test('clicking + New Risk opens the modal without navigating away', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/risks`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        await authedPage.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await waitForHydration(authedPage);
        const listUrl = authedPage.url();

        await authedPage.click('#new-risk-btn');

        await expect(authedPage.locator('#risk-title')).toBeVisible({
            timeout: 60_000,
        });
        expect(authedPage.url()).toBe(listUrl);

        await authedPage.click('#new-risk-cancel-btn');
        await expect(authedPage.locator('#risk-title')).toBeHidden({ timeout: 5000 });
    });

    test('Submit is disabled until Title is filled', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/risks`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        await authedPage.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await waitForHydration(authedPage);
        await authedPage.click('#new-risk-btn');
        await expect(authedPage.locator('#risk-title')).toBeVisible({
            timeout: 60_000,
        });

        await expect(authedPage.locator('#submit-risk')).toBeDisabled();
        await authedPage.fill('#risk-title', 'T');
        await expect(authedPage.locator('#submit-risk')).toBeEnabled();
        await authedPage.fill('#risk-title', '');
        await expect(authedPage.locator('#submit-risk')).toBeDisabled();

        await authedPage.click('#new-risk-cancel-btn');
        await expect(authedPage.locator('#risk-title')).toBeHidden({ timeout: 5000 });
    });

    test('Cancel closes the modal and the list stays visible', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/risks`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        await authedPage.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await waitForHydration(authedPage);
        await authedPage.click('#new-risk-btn');
        await expect(authedPage.locator('#risk-title')).toBeVisible({
            timeout: 60_000,
        });

        await authedPage.click('#new-risk-cancel-btn');

        await expect(authedPage.locator('#risk-title')).toBeHidden({ timeout: 5000 });
        await expect(
            authedPage.locator('[data-testid="risks-table"]'),
        ).toBeVisible();
    });

    test('submitting creates the risk and the list refreshes', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/risks`);
        await authedPage.waitForSelector('#new-risk-btn', { timeout: 15000 });
        await authedPage.click('#new-risk-btn');
        await expect(authedPage.locator('#risk-title')).toBeVisible({
            timeout: 30_000,
        });

        const uid = Date.now().toString(36);
        const title = `Modal Risk ${uid}`;
        await authedPage.fill('#risk-title', title);
        await authedPage.fill('#risk-description', 'Created via the Epic 54 modal.');

        const [response] = await Promise.all([
            authedPage.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().endsWith('/risks') &&
                    r.request().method() === 'POST',
            ),
            authedPage.click('#submit-risk'),
        ]);
        expect(response.status(), 'POST /risks succeeded').toBeLessThan(400);

        await expect(authedPage.locator('#risk-title')).toBeHidden({
            timeout: 10000,
        });
        await expect(
            authedPage.locator('[data-testid="risks-table"]'),
        ).toContainText(title, { timeout: 15000 });
    });

    test('/risks/new deep link redirects to the list with the modal auto-open', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/risks/new`);

        await expect(authedPage.locator('#risk-title')).toBeVisible({
            timeout: 15000,
        });
        await expect(authedPage).toHaveURL(/\/risks(\?|$)/);
    });
});
