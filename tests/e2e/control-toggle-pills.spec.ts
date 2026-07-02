import { randomUUID } from 'node:crypto';
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';

/**
 * Controls list — read-only Status + Applicability badges.
 *
 * 2026-05-19 — the inline-edit `<select>` dropdowns on the
 * Controls list table were retired at the user's request. Status
 * changes now route through the detail page (Edit Control sheet)
 * or the bulk-set toolbar; applicability changes route through
 * the detail page where the justification modal lives.
 *
 * Pre-retirement, this spec exercised the dropdown end-to-end:
 *   • status select → pick value → confirm POST
 *   • applicability → N/A → justification modal → save
 *   • reader sees a static <span> not a select
 *
 * Post-retirement, every viewer sees the same read-only badge.
 * The spec retains the load-bearing existence checks (id parity
 * for downstream selectors + non-`<select>` shape) so a future
 * regression that re-introduces the inline editor on the list
 * fails CI; the transition flows themselves are covered by the
 * per-control detail-page specs.
 *
 * Isolation: each `test()` runs against its own fresh, empty tenant
 * via the `isolatedTenant` fixture (see `./fixtures`). The tenant
 * starts empty, so each test mints one control up front to give the
 * list a row carrying the status / applicability pills it asserts on.
 */

/**
 * Create a single control on the current (isolated) tenant so the
 * controls list has exactly one row carrying the pill ids.
 * Self-contained: nothing is shared across tests.
 */
async function createControl(page: Page, slug: string): Promise<void> {
    const uid = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    await page.goto(`/t/${slug}/controls/new`);
    await page.waitForSelector('#control-name-input', { timeout: 15000 });
    await page.fill('#control-name-input', `E2E Control ${uid}`);
    await page.fill('#control-code-input', `CTRL-${uid}`);
    await page.click('#create-control-btn');
    await page.waitForSelector('#control-title', { timeout: 15000 });
}

test.describe('Controls list — read-only status/applicability badges', () => {
    test('status pill renders as a <span> (NOT a <select>)', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;
        await createControl(authedPage, tenantSlug);

        await authedPage.goto(`/t/${tenantSlug}/controls`);
        await authedPage.waitForSelector('#controls-table', { timeout: 15000 });

        const firstRow = authedPage.locator('#controls-table tbody tr').first();
        const statusPill = firstRow.locator('[id^="status-pill-"]');
        await expect(statusPill).toBeVisible({ timeout: 5000 });

        // Read-only: must NOT be a <select>. A future PR that
        // re-introduces the inline editor on the list page would
        // fail this assertion.
        const tagName = await statusPill.evaluate((el) =>
            el.tagName.toLowerCase(),
        );
        expect(tagName).not.toBe('select');
    });

    test('applicability pill renders as a <span> (NOT a <select>)', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;
        await createControl(authedPage, tenantSlug);

        await authedPage.goto(`/t/${tenantSlug}/controls`);
        await authedPage.waitForSelector('#controls-table', { timeout: 15000 });

        const firstRow = authedPage.locator('#controls-table tbody tr').first();
        const applicabilityPill = firstRow.locator(
            '[id^="applicability-pill-"]',
        );
        await expect(applicabilityPill).toBeVisible({ timeout: 5000 });

        const tagName = await applicabilityPill.evaluate((el) =>
            el.tagName.toLowerCase(),
        );
        expect(tagName).not.toBe('select');
    });

    test('justification modal is NOT mounted on the list page', async ({
        authedPage,
        isolatedTenant,
    }) => {
        // Pre-retirement, picking N/A in the list opened the
        // modal here. The modal infrastructure moved to the
        // detail page; the list no longer carries it.
        const { tenantSlug } = isolatedTenant;
        await createControl(authedPage, tenantSlug);

        await authedPage.goto(`/t/${tenantSlug}/controls`);
        await authedPage.waitForSelector('#controls-table', { timeout: 15000 });

        await expect(authedPage.locator('#justification-input')).toHaveCount(0);
        await expect(authedPage.locator('#justification-save-btn')).toHaveCount(0);
    });
});
