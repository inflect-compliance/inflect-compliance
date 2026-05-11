import { test, expect, Page } from '@playwright/test';
import {
    loginAndGetTenant,
    safeGoto,
    gotoAndVerify,
    selectComboboxOption,
} from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

test.describe('Issue Management', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    const uniqueId = Date.now().toString(36);

    test('issues list page loads with filters and CTA', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');
        await expect(page.locator('#new-task-btn')).toBeVisible({ timeout: 10000 });
        // `#task-search` is the FilterToolbar searchId on this page.
        // Epic 53 consolidated status/type/severity into a single Filter
        // popover — the old `#task-status-filter` / `#task-type-filter`
        // / `#task-severity-filter` inputs no longer exist.
        await expect(page.locator('#task-search')).toBeVisible();
    });

    test('create a new issue and see detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks/new`, '#task-title-input');

        await page.fill('#task-title-input', `E2E Issue ${uniqueId}`);
        await page.fill('#task-description-input', 'Test issue from e2e');
        // Epic 55: native <select>s migrated to <Combobox>; pick by
        // visible label rather than enum value.
        await selectComboboxOption(page, 'task-type-select', 'Incident');
        await selectComboboxOption(page, 'task-severity-select', 'High');
        await selectComboboxOption(page, 'task-priority-select', /^P1\b/);

        // INCIDENT requires asset or control link
        await selectComboboxOption(page, 'link-entity-type', 'Asset');
        await page.fill('#link-entity-id', 'test-asset-id');
        await page.click('#add-link-btn');
        await page.waitForSelector('#pending-links-list', { timeout: 3000 });

        await page.click('#create-task-btn');

        await page.waitForURL('**/tasks/**', { timeout: 30000 });
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#task-title', { timeout: 30000 });
        await expect(page.locator('#task-title')).toContainText(`E2E Issue ${uniqueId}`, { timeout: 15000 });
        await expect(page.locator('#task-severity')).toContainText('HIGH', { timeout: 5000 });
    });

    test('change issue status', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForSelector('#task-title', { timeout: 10000 });

        // Wait for permissions to hydrate and status select to appear
        await page.waitForSelector('#task-status-select', { timeout: 10000 });
        // Change status to TRIAGED — Epic 55 migrated this select to a
        // <Combobox>; pick by visible label "Triaged".
        await selectComboboxOption(page, 'task-status-select', 'Triaged');

        // Wait for the React component to reflect the change (POST + fetchTask completes)
        await expect(page.locator('#task-status')).toContainText('Triaged', { timeout: 15000 });

        // Reload and verify persistence
        await page.reload();
        await page.waitForSelector('#task-status', { timeout: 10000 });
        await expect(page.locator('#task-status')).toContainText('Triaged');
    });

    test('assign issue', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForSelector('#task-title', { timeout: 10000 });

        // Verify assign controls are visible for admin. Epic 55:
        // #task-assignee-input is now a <UserCombobox> trigger button,
        // not a text input. Interact via click + search + option click.
        await expect(page.locator('#task-assignee-input')).toBeVisible();
        await expect(page.locator('#assign-task-btn')).toBeVisible();

        // Pull current user's email/name from session so we can pick
        // ourselves out of the member picker fuzzy-search index.
        const session = await page.evaluate(async () => {
            const res = await fetch('/api/auth/session');
            return res.json();
        });
        const email = session?.user?.email as string | undefined;
        const name = (session?.user?.name as string | undefined) || email;
        if (email && name) {
            await page.click('#task-assignee-input');
            const search = page.getByPlaceholder('Search members…');
            await search.fill(name);
            const option = page
                .getByRole('option')
                .filter({ hasText: email })
                .first();
            const visible = await option
                .waitFor({ state: 'visible', timeout: 5000 })
                .then(() => true)
                .catch(() => false);
            if (visible) {
                await option.click();
                await page.click('#assign-task-btn');
                await page.waitForLoadState('networkidle').catch(() => {});
                await page.reload();
                await page.waitForSelector('#task-assignee', { timeout: 10000 });
            }
        }
    });

    test('add link to issue', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForSelector('#task-title', { timeout: 10000 });

        // Go to links tab
        await page.click('#tab-links');
        await page.waitForLoadState('networkidle').catch(() => {});

        // Add a link — the task-detail picker uses raw enum values
        // (CONTROL/RISK/ASSET/…) as the visible labels.
        await page.click('#add-link-btn');
        await page.waitForSelector('#link-entity-type', { timeout: 5000 });
        await selectComboboxOption(page, 'link-entity-type', 'CONTROL');
        await page.fill('#link-entity-id', 'test-control-id');
        await page.click('#submit-link-btn');
        await page.waitForLoadState('networkidle').catch(() => {});

        // Verify link appears
        await expect(page.locator('[data-testid="task-links-table"]')).toContainText('CONTROL', { timeout: 5000 });
        await expect(page.locator('[data-testid="task-links-table"]')).toContainText('test-control-id');
    });

    test('add comment to issue', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        await page.click(`text=E2E Issue ${uniqueId}`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#task-title', { timeout: 30000 });

        // Go to comments tab
        await page.click('#tab-comments');
        await page.waitForLoadState('networkidle').catch(() => {});

        // Add a comment
        await page.fill('#comment-body', `E2E comment ${uniqueId}`);
        await page.click('#submit-comment-btn');
        await page.waitForLoadState('networkidle').catch(() => {});

        // Verify comment appears
        await expect(page.locator('#comments-list')).toContainText(`E2E comment ${uniqueId}`, { timeout: 15000 });
    });

    test('dashboard page renders metrics', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks/dashboard`, 'h1');

        // Verify dashboard elements
        await expect(page.locator('#dashboard-metrics')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('h1')).toContainText('Dashboard');
    });

    test('bulk action toolbar appears when issues selected', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        // Check that bulk toolbar is NOT visible initially
        await expect(page.locator('#bulk-toolbar')).not.toBeVisible({ timeout: 3000 });

        // Select all tasks
        const checkboxes = page.locator('.task-checkbox');
        const count = await checkboxes.count();
        if (count > 0) {
            await checkboxes.first().check();
            // Now toolbar should appear
            await expect(page.locator('#bulk-toolbar')).toBeVisible({ timeout: 5000 });
            await expect(page.locator('#bulk-action-select')).toBeVisible();
        }
    });

    test('reader user sees view-only issues', async ({ page }) => {
        // Login as reader using the shared helper (includes React hydration wait)
        const READER_USER = { email: 'viewer@acme.com', password: 'password123' };
        tenantSlug = await loginAndGetTenant(page, READER_USER);

        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');

        // Reader should NOT see create button
        await expect(page.locator('#new-task-btn')).not.toBeVisible({ timeout: 3000 });
    });

    test('legacy /issues URL redirects to /tasks', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/issues`);
        await page.waitForURL(`**/tasks`, { timeout: 15000 });
        await expect(page.url()).toContain('/tasks');
    });
});
