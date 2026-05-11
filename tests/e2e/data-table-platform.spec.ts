import { test, expect } from '@playwright/test';
import { loginAndGetTenant } from './e2e-utils';

/**
 * DataTable Platform E2E — Validates that all migrated list pages render
 * consistently using the shared DataTable architecture.
 *
 * These tests do NOT test business logic (that's in entity-specific specs).
 * They test platform-level table behaviors:
 *   - Tables render with proper structure (thead/tbody/rows)
 *   - Column headers are visible
 *   - Empty states work
 *   - Loading doesn't crash
 *   - Row click navigation works
 *   - Filter interactions are wired
 *
 * This spec is the "one team owns the platform" regression net.
 */

test.describe('DataTable Platform — Cross-page regression', () => {
    let tenantSlug: string;

    // ── Helper: verify a list page renders a DataTable ───

    async function assertTableRendered(page: import('@playwright/test').Page, path: string, opts?: {
        heading?: string;
        testId?: string;
        minHeaders?: number;
        filterSelector?: string;
    }) {
        await page.goto(`/t/${tenantSlug}${path}`);
        await page.waitForLoadState('networkidle').catch(() => {});

        // Wait for heading
        if (opts?.heading) {
            await expect(page.locator('h1')).toContainText(opts.heading, { timeout: 15000 });
        } else {
            await page.waitForSelector('h1', { timeout: 15000 });
        }

        // Verify table structure exists (DataTable renders <table> internally)
        const tableLocator = opts?.testId
            ? page.locator(`[data-testid="${opts.testId}"] table`)
            : page.locator('table').first();

        // Table might be empty — that's fine, but the structure should exist
        // unless there's genuinely no data (empty state shown instead).
        // Bumped from 5s → 15s: admin audit-log occasionally takes
        // longer than 5s on the first load (the audit-log API hits a
        // hash-chain integrity check before returning), and the
        // 5s budget produced a flake under load.
        const tableVisible = await tableLocator.isVisible({ timeout: 15000 }).catch(() => false);

        if (tableVisible) {
            // If table is visible, verify it has headers
            const headerCount = await tableLocator.locator('thead th').count();
            const minHeaders = opts?.minHeaders ?? 2;
            expect(headerCount).toBeGreaterThanOrEqual(minHeaders);
        } else {
            // Empty state should be visible when table has no data
            // DataTable renders <TableEmptyState> or custom emptyState prop
            const emptyVisible = await page.locator('text=/no .+ found|no .+ yet|no .+ match/i').isVisible({ timeout: 3000 }).catch(() => false);
            // Either table or empty state must be present
            expect(tableVisible || emptyVisible).toBe(true);
        }

        // Verify no legacy skeleton on the page
        const skeletonTableRow = await page.locator('.data-table tbody .animate-pulse').count();
        // After load, there should be no skeleton rows (DataTable handles loading internally)
        if (skeletonTableRow > 0) {
            // This is acceptable during loading transitions, but after networkidle should be 0
            // Allow a brief grace period for slow renders
            await page.waitForTimeout(1000);
            const afterWait = await page.locator('.data-table tbody .animate-pulse').count();
            expect(afterWait).toBe(0);
        }
    }

    // ── Controls ──

    test('Controls page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/controls', {
            heading: 'Controls',
            filterSelector: '#control-search',
            minHeaders: 3,
        });
    });

    // ── Policies ──

    test('Policies page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/policies', {
            heading: 'Polic',
            testId: 'policies-table',
            minHeaders: 3,
        });
    });

    // ── Tasks ──

    test('Tasks page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/tasks', {
            heading: 'Tasks',
            testId: 'tasks-table',
            minHeaders: 4,
        });
    });

    // ── Risks ──

    test('Risks page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/risks', {
            heading: 'Risk',
            testId: 'risks-table',
            minHeaders: 3,
        });
    });

    // ── Vendors ──

    test('Vendors page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/vendors', {
            heading: 'Vendor',
            testId: 'vendors-table',
            minHeaders: 3,
        });
    });

    // ── Assets ──

    test('Assets page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/assets', {
            heading: 'Asset',
            testId: 'assets-table',
            minHeaders: 3,
        });
    });

    // ── Findings ──

    test('Findings page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/findings', {
            heading: 'Finding',
            testId: 'findings-table',
            minHeaders: 3,
        });
    });

    // ── Evidence ──

    test('Evidence page renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/evidence', {
            heading: 'Evidence',
            minHeaders: 3,
        });
    });

    // ── Admin Audit Log ──

    test('Admin audit log renders DataTable', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await assertTableRendered(page, '/admin', {
            testId: 'audit-log-table',
            minHeaders: 3,
        });
    });
});

test.describe('DataTable Platform — Row click navigation', () => {
    let tenantSlug: string;

    test('Controls row double-click navigates to detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 15000 });

        // R13-PR2 — row opens on double-click, not single-click.
        // Seed provisions 4 tenant controls; assert visibility.
        // Target the second visible cell (the code cell), which is
        // not interactive — DataTable ignores double-clicks landing
        // on interactive children like the select checkbox or title
        // link.
        const rows = page.locator('tbody tr');
        await expect(rows.first()).toBeVisible({ timeout: 15_000 });

        await rows.first().locator('td').nth(1).dblclick();
        await page.waitForURL(/\/controls\/[a-zA-Z0-9-]+$/, { timeout: 10_000 });
        await expect(page.locator('#control-title')).toBeVisible({ timeout: 10_000 });
    });

    test('Policies row double-click navigates to detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/policies`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 15000 });

        // R13-PR2 — row opens on double-click, not single-click.
        // Seed provisions 3 published policies.
        const rows = page.locator('[data-testid="policies-table"] tbody tr');
        await expect(rows.first()).toBeVisible({ timeout: 15_000 });

        await rows.first().dblclick();
        await page.waitForURL(/\/policies\/[a-zA-Z0-9-]+$/, { timeout: 10_000 });
    });
});

test.describe('DataTable Platform — Filter interaction', () => {
    let tenantSlug: string;

    test('Controls search filter works', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 15000 });

        const searchInput = page.locator('#control-search');
        if (await searchInput.isVisible({ timeout: 3000 }).catch(() => false)) {
            // Type a nonsense query that shouldn't match anything.
            // CompactFilterBar submits on Enter (not on every keystroke) so the query
            // is applied to filters.q only after the keyboard event.
            await searchInput.fill('zzz-no-match-zzz');
            await searchInput.press('Enter');
            await page.waitForLoadState('networkidle').catch(() => {});

            // Should show empty state or filtered results
            const tableRows = await page.locator('tbody tr').count();
            const emptyState = await page.locator('text=/no .+ found|no .+ match/i').isVisible().catch(() => false);
            expect(tableRows === 0 || emptyState).toBe(true);

            // Clear filter
            await searchInput.fill('');
            await searchInput.press('Enter');
            await page.waitForLoadState('networkidle').catch(() => {});
        }
    });

    test('Tasks filter bar is interactive', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/tasks`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 15000 });

        // Check filter bar exists
        const searchInput = page.locator('#task-search');
        const filterVisible = await searchInput.isVisible({ timeout: 3000 }).catch(() => false);
        expect(filterVisible).toBe(true);
    });
});
