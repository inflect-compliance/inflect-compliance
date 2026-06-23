/**
 * E2E — `<EntityDetailLayout>` structural promises (quality roadmap
 * P4, item 4).
 *
 * Detail-page shells are exercised tangentially by feature E2E (a
 * risk-edit spec navigates *through* the shell), but the layout's
 * own promises — the breadcrumb / header / rail / tab-bar
 * composition — have no dedicated browser test. This spec opens a
 * representative detail surface (a risk) and asserts the shell
 * paints the contract.
 *
 * Isolation: runs against its own fresh, empty tenant via the
 * `isolatedTenant` fixture (see `./fixtures`). The tenant starts with
 * no risks, so the test mints one through the New Risk modal before
 * opening its detail page.
 */
import { test, expect } from './fixtures';
import { safeGoto } from './e2e-utils';

test.describe('EntityDetailLayout', () => {
    test('risk detail page renders the shell — breadcrumbs, header, body', async ({
        authedPage,
        isolatedTenant,
    }) => {
        const { tenantSlug } = isolatedTenant;

        await safeGoto(authedPage, `/t/${tenantSlug}/risks`, {
            waitUntil: 'domcontentloaded',
        });
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        // The tenant starts empty — create a risk so the register has a
        // row to open.
        await authedPage.waitForSelector('#new-risk-btn', { timeout: 15_000 });
        await authedPage.click('#new-risk-btn');
        await expect(authedPage.locator('#risk-title')).toBeVisible({
            timeout: 30_000,
        });
        const uid = Date.now().toString(36);
        const title = `E2E Detail Risk ${uid}`;
        await authedPage.fill('#risk-title', title);
        await authedPage.fill('#risk-description', 'Risk created for the detail-shell E2E.');
        await Promise.all([
            authedPage.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().endsWith('/risks') &&
                    r.request().method() === 'POST',
            ),
            authedPage.click('#submit-risk'),
        ]);
        await expect(authedPage.locator('#risk-title')).toBeHidden({
            timeout: 10_000,
        });
        await expect(
            authedPage.locator('[data-testid="risks-table"]'),
        ).toContainText(title, { timeout: 15_000 });

        // Open the risk we just created — the only row of the register.
        const firstRow = authedPage.locator('tbody tr').first();
        await expect(firstRow).toBeVisible({ timeout: 15_000 });
        await firstRow.dblclick();
        await authedPage.waitForURL(/\/risks\/[a-zA-Z0-9-]+$/, {
            timeout: 15_000,
        });

        // The shell's three structural promises:
        // (1) the PageHeader subtree carrying breadcrumbs + title.
        await expect(
            authedPage.locator('[data-testid="entity-detail-header"]'),
        ).toBeVisible({ timeout: 10_000 });
        // (2) the body wrapper. (The risk surface no longer passes a
        //     `rail` — Linked Tasks moved into the Tasks tab — so the
        //     rail is intentionally absent here; the AsidePanel
        //     primitive keeps its own rendered test.)
        await expect(
            authedPage.locator('[data-entity-detail-layout]'),
        ).toBeVisible();
    });
});
