/**
 * Control → Evidence linking — mutating E2E.
 *
 * Isolation: every `test()` runs on its own fresh, empty tenant via
 * the `isolatedTenant` fixture. Each test mints the control (and,
 * where needed, the linked evidence) it operates on inside its own
 * body — no `controlDetailPath` is carried across tests in a
 * module-level `let`. A failed setup degrades to one red test
 * instead of cascading through the whole file.
 *
 * All selectors use existing id attributes — no data-testid additions.
 */
import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/** Create a control on the isolated tenant; return its detail path. */
async function createControl(page: Page, slug: string): Promise<string> {
    const uid = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    await page.goto(`/t/${slug}/controls/new`);
    await page.waitForSelector('#control-name-input', { timeout: 15000 });
    await page.fill('#control-name-input', `Evidence Test ${uid}`);
    await page.fill('#control-code-input', `EV-${uid}`);
    await page.click('#create-control-btn');
    await page.waitForSelector('#control-title', { timeout: 60000 });
    return new URL(page.url()).pathname;
}

/** Link a URL evidence record to the open control's Evidence tab. */
async function linkUrlEvidence(page: Page, note: string): Promise<void> {
    await page.click('#tab-evidence');
    await page.click('#link-evidence-btn');
    await page.fill('#evidence-url-input', 'https://example.com/evidence-doc');
    await page.fill('#evidence-note-input', note);
    await page.click('#submit-evidence-btn');
    await expect(page.locator('#evidence-table')).toBeVisible({ timeout: 10000 });
}

test.describe('Control → Evidence Linking', () => {
    test('create control for evidence linking', async ({ authedPage, isolatedTenant }) => {
        const uid = Date.now().toString(36);
        await authedPage.goto(`/t/${isolatedTenant.tenantSlug}/controls/new`);
        await authedPage.waitForSelector('#control-name-input', { timeout: 15000 });

        await authedPage.fill('#control-name-input', `Evidence Test ${uid}`);
        await authedPage.fill('#control-code-input', `EV-${uid}`);
        await authedPage.click('#create-control-btn');
        await authedPage.waitForSelector('#control-title', { timeout: 60000 });
        await expect(authedPage.locator('#control-title')).toContainText(
            `Evidence Test ${uid}`,
        );
    });

    test('evidence tab starts empty', async ({ authedPage, isolatedTenant }) => {
        const controlDetailPath = await createControl(
            authedPage,
            isolatedTenant.tenantSlug,
        );
        await authedPage.goto(controlDetailPath);
        await authedPage.waitForSelector('#control-title', { timeout: 15000 });

        await authedPage.click('#tab-evidence');
        await expect(authedPage.locator('#no-evidence')).toBeVisible({ timeout: 5000 });
    });

    test('link URL evidence from control context', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const uid = Date.now().toString(36);
        const controlDetailPath = await createControl(
            authedPage,
            isolatedTenant.tenantSlug,
        );
        await authedPage.goto(controlDetailPath);
        await authedPage.waitForSelector('#control-title', { timeout: 15000 });

        await authedPage.click('#tab-evidence');
        await authedPage.click('#link-evidence-btn');
        await authedPage.fill('#evidence-url-input', 'https://example.com/evidence-doc');
        await authedPage.fill('#evidence-note-input', `Test link ${uid}`);
        await authedPage.click('#submit-evidence-btn');

        await expect(authedPage.locator('#evidence-table')).toBeVisible({ timeout: 10000 });
        await expect(authedPage.locator('#evidence-table')).toContainText('LINK');
        await expect(authedPage.locator('#evidence-table')).toContainText(
            'https://example.com/evidence-doc',
        );
    });

    test('the + Evidence form offers both file upload and URL link', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const controlDetailPath = await createControl(
            authedPage,
            isolatedTenant.tenantSlug,
        );
        await authedPage.goto(controlDetailPath);
        await authedPage.waitForSelector('#control-title', { timeout: 15000 });

        await authedPage.click('#tab-evidence');
        // The separate "Upload Evidence" button was merged into "+ Evidence".
        await authedPage.click('#link-evidence-btn');
        await expect(authedPage.locator('#control-evidence-form')).toBeVisible({
            timeout: 5000,
        });
        // File-upload section (browse + title) now lives in this one form…
        await expect(authedPage.locator('#control-file-input')).toBeVisible();
        await expect(authedPage.locator('#control-upload-title')).toBeVisible();
        // …alongside the URL-link section.
        await expect(authedPage.locator('#evidence-url-input')).toBeVisible();
    });

    test('unlink evidence removes it from tab', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const uid = Date.now().toString(36);
        const controlDetailPath = await createControl(
            authedPage,
            isolatedTenant.tenantSlug,
        );
        await authedPage.goto(controlDetailPath);
        await authedPage.waitForSelector('#control-title', { timeout: 15000 });

        // This test needs a row to unlink — create one first.
        await linkUrlEvidence(authedPage, `Test link ${uid}`);

        // Count rows before
        const rowsBefore = await authedPage
            .locator('#evidence-table tbody tr')
            .count();
        expect(rowsBefore).toBeGreaterThan(0);

        // Click the first remove button
        const removeBtn = authedPage
            .locator('#evidence-table tbody tr button')
            .first();
        await removeBtn.click();

        // Wait for refetch — row count should decrease
        await expect(async () => {
            const rowsAfter = await authedPage
                .locator('#evidence-table tbody tr')
                .count();
            expect(rowsAfter).toBeLessThan(rowsBefore);
        }).toPass({ timeout: 15000 });
    });
});
