/**
 * E2E Reporting & Audit Narrative Tests
 *
 * Serial test suite covering:
 * A) Frameworks page loads with framework cards
 * B) Framework coverage report — metrics visible
 * C) Coverage export (JSON) — client-side download triggers
 * D) Reports page — SOA & Risk Register tables render
 * E) Audit cycle creation (ISO27001)
 * F) Audit pack creation, freeze, and share link generation
 * G) Shared pack read-only view (unauthenticated)
 *
 * Uses AUTH_TEST_MODE=1 credentials provider (admin@acme.com).
 */
import { test, expect, Page, BrowserContext } from '@playwright/test';
import { loginAndGetTenant, gotoAndVerify } from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };
const UNIQUE = Date.now().toString(36);

let tenantSlug: string;

test.describe('Reporting & Audit Narrative', () => {
    test.describe.configure({ mode: 'serial' });

    // Shared state for serial flow
    let cycleId: string;
    let packId: string;
    let shareToken: string;

    // ─── A) Frameworks Page ───────────────────────────────────────────

    test('A — frameworks page loads with framework cards', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // VERIFY-ON-EXIT: check heading rendered, not just HTTP status
        await gotoAndVerify(page, `/t/${tenantSlug}/frameworks`, '#frameworks-heading');

        await expect(page.locator('#frameworks-heading')).toContainText('Compliance Frameworks');

        // Wait for cards to hydrate. Epic 66 switched the per-card
        // selector from `id="fw-card-..."` to `data-testid="fw-card-..."`
        // when migrating to the `<CardList>` primitive.
        await page.waitForLoadState('networkidle').catch(() => {});
        const cardCount = await page.locator('[data-testid^="fw-card-"]').count();
        expect(cardCount).toBeGreaterThanOrEqual(1);
    });

    // ─── B) Coverage Report ──────────────────────────────────────────

    test('B — ISO27001 coverage tab shows metrics', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // The coverage data lives on the framework detail page under
        // the Coverage tab — there is no standalone `/coverage` route.
        await gotoAndVerify(page, `/t/${tenantSlug}/frameworks/ISO27001`, '#framework-detail-heading', 3);

        await expect(page.locator('#tab-coverage')).toBeVisible({ timeout: 30_000 });
        await page.locator('#tab-coverage').click();
        await expect(page.locator('#coverage-panel')).toBeVisible({ timeout: 30_000 });
    });

    // ─── D) Reports Page ─────────────────────────────────────────────

    test('D — reports page shows SOA and Risk Register', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // VERIFY-ON-EXIT: check reports heading rendered
        await gotoAndVerify(page, `/t/${tenantSlug}/reports`, '#reports-heading', 4);

        // SOA tab should be active by default
        await expect(page.locator('#soa-tab-btn')).toBeVisible();
        await expect(page.locator('#risk-tab-btn')).toBeVisible();
        await expect(page.locator('#soa-table')).toBeVisible({ timeout: 5000 });

        // Roadmap-2 PR-12 — exports are tab-aware: SoA tab shows
        // SoA exports, Risk Register tab shows Risk Register
        // exports. Only one cluster is visible at a time.
        await expect(page.locator('#export-soa-btn')).toBeVisible();

        // Switch to Risk Register tab
        await page.click('#risk-tab-btn');
        await expect(page.locator('#risk-table')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#export-risks-btn')).toBeVisible();

        // Switch back to SOA tab
        await page.click('#soa-tab-btn');
        await expect(page.locator('#soa-table')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#export-soa-btn')).toBeVisible();
    });

    // ─── E) Create Audit Cycle ───────────────────────────────────────

    test('E — create audit cycle (ISO27001)', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // VERIFY-ON-EXIT: check heading rendered
        await gotoAndVerify(page, `/t/${tenantSlug}/audits/cycles`, 'h1', 3);

        // Click "New Audit Cycle"
        await page.click('#create-cycle-btn');
        await page.waitForSelector('#cycle-form', { timeout: 5000 });

        // Fill form — ISO27001 is the default selection in the
        // Epic 55 Combobox migration of #fw-select, so no click needed.
        await page.fill('#cycle-name-input', `E2E Audit Cycle ${UNIQUE}`);

        // Submit
        await page.click('#submit-cycle-btn');

        // Should redirect to cycle detail
        await page.waitForURL(/\/audits\/cycles\//, { timeout: 15000 });
        await page.waitForSelector('#cycle-name', { timeout: 15000 });
        await expect(page.locator('#cycle-name')).toContainText(`E2E Audit Cycle ${UNIQUE}`);

        // Store cycle ID from URL
        const urlMatch = page.url().match(/\/cycles\/([^/]+)/);
        expect(urlMatch).toBeTruthy();
        cycleId = urlMatch![1];
    });

    // ─── F) Create Pack, Freeze, Share ───────────────────────────────

    test('F — create default pack, freeze, and generate share link', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Navigate to cycle detail with verify-on-exit
        expect(cycleId).toBeTruthy();
        await gotoAndVerify(page, `/t/${tenantSlug}/audits/cycles/${cycleId}`, '#cycle-name', 3);

        // Click "Create Pack from Default Selection"
        const createPackBtn = page.locator('#create-default-pack-btn');
        await expect(createPackBtn).toBeVisible({ timeout: 5000 });
        await createPackBtn.click();

        // Should redirect to the pack detail page
        await page.waitForURL(/\/audits\/packs\//, { timeout: 60000 });
        await page.waitForSelector('#pack-name', { timeout: 15000 });

        // Extract pack ID from URL
        const packMatch = page.url().match(/\/packs\/([^/]+)/);
        expect(packMatch).toBeTruthy();
        packId = packMatch![1];

        // Verify pack is in DRAFT status
        await expect(page.locator('#pack-status')).toContainText('DRAFT');

        // Freeze the pack
        // The freeze operation creates snapshots for every item and attaches
        // an SoA report. On cold environments this triggers JIT compilation
        // of multiple API routes and can take 30-60s.
        const freezeBtn = page.locator('#freeze-pack-btn');
        await expect(freezeBtn).toBeVisible({ timeout: 5000 });

        // Click freeze and wait for the API round-trip to complete.
        // The client calls POST ?action=freeze, then re-fetches the pack.
        await Promise.all([
            page.waitForResponse(
                resp => resp.url().includes('/audits/packs/') && resp.url().includes('action=freeze'),
                { timeout: 90000 },
            ),
            freezeBtn.click(),
        ]);

        // After the freeze API responds, the page re-fetches pack data.
        // Wait for that network activity to settle and the UI to update.
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('#pack-status')).toContainText('FROZEN', { timeout: 60000 });

        // Share button should now appear
        const shareBtn = page.locator('#share-pack-btn');
        await expect(shareBtn).toBeVisible({ timeout: 5000 });
        await shareBtn.click();

        // Wait for share link card to appear
        await expect(page.locator('#share-link-card')).toBeVisible({ timeout: 10000 });
        const shareUrl = await page.locator('#share-link-url').textContent();
        expect(shareUrl).toBeTruthy();
        expect(shareUrl).toContain('/audit/shared/');

        // Extract the token from the share URL
        const tokenMatch = shareUrl!.match(/\/audit\/shared\/([^/]+)/);
        expect(tokenMatch).toBeTruthy();
        shareToken = tokenMatch![1];
    });

    // ─── G) Shared Read-Only View ────────────────────────────────────

    test('G — shared pack is accessible without login (read-only)', async ({ browser }) => {
        expect(shareToken).toBeTruthy();

        // Open a fresh browser context (no cookies, no login).
        const freshContext: BrowserContext = await browser.newContext();
        const freshPage = await freshContext.newPage();

        try {
            await freshPage.goto(`/audit/shared/${shareToken}`, { timeout: 30000 });
            await freshPage.waitForLoadState('networkidle').catch(() => {});
            await freshPage.waitForSelector('#shared-pack-name', { timeout: 30000 });

            // Verify the shared pack name is visible
            await expect(freshPage.locator('#shared-pack-name')).toBeVisible();

            // Verify read-only summary section is shown
            await expect(freshPage.locator('#shared-pack-summary')).toBeVisible({ timeout: 5000 });

            // Verify the footer states it's read-only
            await expect(freshPage.locator('text=Read-only view').first()).toBeVisible({ timeout: 5000 });

            // Ensure no edit/freeze buttons exist (read-only)
            await expect(freshPage.locator('#freeze-pack-btn')).not.toBeVisible();
            await expect(freshPage.locator('#share-pack-btn')).not.toBeVisible();
        } finally {
            // Wrap cleanup in try-catch to handle ENOENT errors from Playwright's
            // trace artifact finalization on Windows with manually-created contexts.
            try { await freshPage.close(); } catch { /* ignore */ }
            try { await freshContext.close(); } catch { /* ignore */ }
        }
    });
});
