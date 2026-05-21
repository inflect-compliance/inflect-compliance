/**
 * Vendor Management — mutating E2E.
 *
 * Isolation: each `test()` runs on its own fresh, empty tenant via
 * the `isolatedTenant` fixture. Tests that need a pre-existing
 * vendor create one via the `createVendor` helper — the previous
 * shape had tests 3-4 click `[id^="vendor-link-"]` to find a vendor
 * minted by test 2, an implicit order-dependent cascade. Each test
 * is now self-contained.
 *
 * All selectors use existing id attributes — no data-testid additions.
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { gotoAndVerify, selectComboboxOption } from './e2e-utils';

/** Create a vendor on the isolated tenant and land on its detail page. */
async function createVendor(page: Page, slug: string): Promise<string> {
    const uid = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const name = `E2E Vendor ${uid}`;
    await gotoAndVerify(page, `/t/${slug}/vendors/new`, '#vendor-name-input');
    await page.fill('#vendor-name-input', name);
    await selectComboboxOption(page, 'vendor-criticality-select', 'High');
    await page.click('#create-vendor-submit');
    await page.waitForURL(/\/vendors\//, { timeout: 60000 });
    await expect(page.locator('#vendor-detail-name')).toBeVisible({ timeout: 30000 });
    return name;
}

test.describe('Vendor Management', () => {
    test('vendor register page loads', async ({ authedPage, isolatedTenant }) => {
        await gotoAndVerify(authedPage, `/t/${isolatedTenant.tenantSlug}/vendors`, 'h1');
        await expect(authedPage.locator('h1')).toContainText('Vendor Register', {
            timeout: 15000,
        });
        await expect(authedPage.locator('#new-vendor-btn')).toBeVisible();
    });

    test('create vendor and navigate to detail', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const uid = Date.now().toString(36);
        const name = `E2E Vendor ${uid}`;
        await gotoAndVerify(
            authedPage,
            `/t/${isolatedTenant.tenantSlug}/vendors/new`,
            '#vendor-name-input',
        );
        await expect(authedPage.locator('#vendor-name-input')).toBeVisible({
            timeout: 15000,
        });

        await authedPage.fill('#vendor-name-input', name);
        await selectComboboxOption(authedPage, 'vendor-criticality-select', 'High');
        await authedPage.click('#create-vendor-submit');

        await authedPage.waitForURL(/\/vendors\//, { timeout: 60000 });
        await expect(authedPage.locator('#vendor-detail-name')).toBeVisible({
            timeout: 30000,
        });
        await expect(authedPage.locator('#vendor-detail-name')).toContainText(name);
    });

    test('vendor detail tabs work', async ({ authedPage, isolatedTenant }) => {
        // Self-contained: create the vendor this test inspects.
        await createVendor(authedPage, isolatedTenant.tenantSlug);

        await authedPage.click('#tab-documents');
        await expect(authedPage.locator('text=No documents')).toBeVisible({
            timeout: 10000,
        });
        await authedPage.click('#tab-assessments');
        await expect(authedPage.locator('text=No assessments')).toBeVisible({
            timeout: 10000,
        });
    });

    test('add document to vendor', async ({ authedPage, isolatedTenant }) => {
        const uid = Date.now().toString(36);
        await createVendor(authedPage, isolatedTenant.tenantSlug);

        await authedPage.click('#tab-documents');
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        await expect(authedPage.locator('#add-doc-btn')).toBeVisible({
            timeout: 20000,
        });
        await authedPage.click('#add-doc-btn');
        await expect(authedPage.locator('#doc-type-select')).toBeVisible({
            timeout: 5000,
        });
        await selectComboboxOption(authedPage, 'doc-type-select', 'SOC 2');
        await authedPage.fill('#doc-title-input', `SOC2 Report 2025 ${uid}`);
        await authedPage.fill('#doc-url-input', 'https://example.com/soc2.pdf');

        await authedPage.click('#submit-doc-btn');
        await expect(authedPage.locator('#doc-type-select')).not.toBeVisible({
            timeout: 15000,
        });

        const docVisible = await authedPage
            .locator(`text=SOC2 Report 2025 ${uid}`)
            .isVisible();
        if (!docVisible) {
            await authedPage.reload();
            await authedPage.waitForLoadState('networkidle').catch(() => {});
            await expect(authedPage.locator('#vendor-detail-name')).toBeVisible({
                timeout: 60000,
            });
            await authedPage.click('#tab-documents');
            await authedPage.waitForLoadState('networkidle').catch(() => {});
        }
        await expect(
            authedPage.locator(`text=SOC2 Report 2025 ${uid}`),
        ).toBeVisible({ timeout: 20000 });
    });
});
