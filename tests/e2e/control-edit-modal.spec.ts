/**
 * Control Edit Modal — mutating E2E.
 *
 * Isolation: each `test()` runs on its own fresh, empty tenant via
 * the `isolatedTenant` fixture. The previous shape located "the
 * first control in the table" — which only works against the seed
 * tenant's pre-existing data. Each test now creates its own control
 * first, so it is self-contained and order-independent. The
 * "edit saves the title" test mutates a row that, on an isolated
 * tenant, cannot pollute the shared seeded tenant.
 *
 * All selectors use existing id / data-testid attributes — no new
 * data-testid attributes added (the edit-modal ones predate this
 * work).
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAndGetTenant } from './e2e-utils';

/** Seed-tenant READER — only used by the read-only role-gate test. */
const READER_USER = { email: 'viewer@acme.com', password: 'password123' };

/** Create a control on the isolated tenant; land on its detail page. */
async function createControl(page: Page, slug: string): Promise<void> {
    const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    await page.goto(`/t/${slug}/controls/new`);
    await page.waitForSelector('#control-name-input', { timeout: 15000 });
    await page.fill('#control-name-input', `Edit Modal Ctrl ${uid}`);
    await page.fill('#control-code-input', `EDM-${uid}`);
    await page.click('#create-control-btn');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForSelector('#control-title', { timeout: 30000 });
}

test.describe('Control Edit Modal', () => {
    test('admin sees Edit button on control detail', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await createControl(authedPage, isolatedTenant.tenantSlug);
        await expect(
            authedPage.locator('[data-testid="control-edit-button"]'),
        ).toBeVisible({ timeout: 5000 });
    });

    test('Edit button opens modal and saves title change', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await createControl(authedPage, isolatedTenant.tenantSlug);

        const originalTitle = (await authedPage
            .locator('#control-title')
            .textContent())!.trim();

        const editBtn = authedPage.locator('[data-testid="control-edit-button"]');
        await editBtn.waitFor({ state: 'visible' });
        await editBtn.click();
        await expect(
            authedPage.locator('[data-testid="control-edit-dialog"]'),
        ).toBeVisible({ timeout: 5000 });

        const nameInput = authedPage.locator('[data-testid="edit-name-input"]');
        await expect(nameInput).toHaveValue(originalTitle);

        const newTitle = `${originalTitle} (edited)`;
        await nameInput.fill(newTitle);

        await authedPage.locator('[data-testid="edit-save-button"]').click();
        await expect(
            authedPage.locator('[data-testid="control-edit-dialog"]'),
        ).toBeHidden({ timeout: 5000 });

        await expect(authedPage.locator('#control-title')).toContainText(
            '(edited)',
            { timeout: 5000 },
        );
        await expect(authedPage.locator('#edit-success-toast')).toBeVisible({
            timeout: 3000,
        });
    });

    test('Cancel closes modal without saving', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await createControl(authedPage, isolatedTenant.tenantSlug);

        const originalTitle = (await authedPage
            .locator('#control-title')
            .textContent())!.trim();

        const editBtn = authedPage.locator('[data-testid="control-edit-button"]');
        await editBtn.waitFor({ state: 'visible' });
        await editBtn.click();
        await expect(
            authedPage.locator('[data-testid="control-edit-dialog"]'),
        ).toBeVisible({ timeout: 5000 });

        await authedPage
            .locator('[data-testid="edit-name-input"]')
            .fill('This should not save');

        await authedPage.locator('[data-testid="edit-cancel-button"]').click();
        await expect(
            authedPage.locator('[data-testid="control-edit-dialog"]'),
        ).toBeHidden({ timeout: 3000 });

        await expect(authedPage.locator('#control-title')).toHaveText(
            originalTitle,
        );
    });

    // Read-only role-gate check — kept on the SHARED seeded tenant.
    // The `isolatedTenant` factory only provisions an OWNER; this test
    // needs the seeded `viewer@acme.com` READER and a pre-existing
    // control. It only navigates + asserts, so it cannot pollute the
    // shared tenant.
    test('reader user does not see Edit button', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, READER_USER);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });

        const firstLink = page
            .locator('#controls-table tbody tr a[id^="control-link-"]')
            .first();
        if (
            await firstLink
                .isVisible({ timeout: 3000 })
                .catch(() => false)
        ) {
            await firstLink.click();
            await page.waitForSelector('#control-title', { timeout: 10000 });
            await expect(
                page.locator('[data-testid="control-edit-button"]'),
            ).not.toBeVisible({ timeout: 3000 });
        }
    });
});
