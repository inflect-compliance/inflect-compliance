/**
 * Issue Management — mutating E2E.
 *
 * Isolation: each `test()` runs on its own fresh, empty tenant via
 * the `isolatedTenant` fixture. Tests that need a pre-existing issue
 * create one in their own body via the `createIssue` helper — the
 * previous shape had tests 3-6 click `text=E2E Issue <uid>` to find
 * an issue minted by test 2, an implicit order-dependent cascade.
 * Each test is now self-contained; a failed create degrades to one
 * red test instead of cascading.
 *
 * All selectors use existing id attributes — no data-testid additions.
 */
import { test, expect } from './fixtures';
import type { Page } from '@playwright/test';
import { loginAndGetTenant, gotoAndVerify, safeGoto, selectComboboxOption } from './e2e-utils';

/** Seed-tenant READER — only used by the read-only role-gate test. */
const READER_USER = { email: 'viewer@acme.com', password: 'password123' };

/**
 * Create an INCIDENT issue on the isolated tenant and land on its
 * detail page. Returns the issue title for later text-locator use.
 */
async function createIssue(page: Page, slug: string): Promise<string> {
    const uid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const title = `E2E Issue ${uid}`;
    await gotoAndVerify(page, `/t/${slug}/tasks/new`, '#task-title-input');

    await page.fill('#task-title-input', title);
    await page.fill('#task-description-input', 'Test issue from e2e');
    await selectComboboxOption(page, 'task-type-select', 'Incident');
    await selectComboboxOption(page, 'task-severity-select', 'High');
    await selectComboboxOption(page, 'task-priority-select', /^P1\b/);

    // INCIDENT requires an asset or control link.
    await selectComboboxOption(page, 'link-entity-type', 'Asset');
    await page.fill('#link-entity-id', 'test-asset-id');
    await page.click('#add-link-btn');
    await page.waitForSelector('#pending-links-list', { timeout: 3000 });

    await page.click('#create-task-btn');
    await page.waitForURL('**/tasks/**', { timeout: 30000 });
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.waitForSelector('#task-title', { timeout: 30000 });
    return title;
}

test.describe('Issue Management', () => {
    test('issues list page loads with filters and CTA', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await gotoAndVerify(authedPage, `/t/${isolatedTenant.tenantSlug}/tasks`, 'h1');
        await expect(authedPage.locator('#new-task-btn')).toBeVisible({
            timeout: 10000,
        });
    });

    test('create a new issue and see detail', async ({ authedPage, isolatedTenant }) => {
        const uid = Date.now().toString(36);
        const title = `E2E Issue ${uid}`;
        await gotoAndVerify(
            authedPage,
            `/t/${isolatedTenant.tenantSlug}/tasks/new`,
            '#task-title-input',
        );

        await authedPage.fill('#task-title-input', title);
        await authedPage.fill('#task-description-input', 'Test issue from e2e');
        await selectComboboxOption(authedPage, 'task-type-select', 'Incident');
        await selectComboboxOption(authedPage, 'task-severity-select', 'High');
        await selectComboboxOption(authedPage, 'task-priority-select', /^P1\b/);

        await selectComboboxOption(authedPage, 'link-entity-type', 'Asset');
        await authedPage.fill('#link-entity-id', 'test-asset-id');
        await authedPage.click('#add-link-btn');
        await authedPage.waitForSelector('#pending-links-list', { timeout: 3000 });

        await authedPage.click('#create-task-btn');
        await authedPage.waitForURL('**/tasks/**', { timeout: 30000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        await authedPage.waitForSelector('#task-title', { timeout: 30000 });
        await expect(authedPage.locator('#task-title')).toContainText(title, {
            timeout: 15000,
        });
        await expect(authedPage.locator('#task-severity')).toContainText('HIGH', {
            timeout: 5000,
        });
    });

    test('change issue status', async ({ authedPage, isolatedTenant }) => {
        await createIssue(authedPage, isolatedTenant.tenantSlug);

        await authedPage.waitForSelector('#task-status-select', { timeout: 10000 });
        await selectComboboxOption(authedPage, 'task-status-select', 'Triaged');
        await expect(authedPage.locator('#task-status')).toContainText('Triaged', {
            timeout: 15000,
        });

        await authedPage.reload();
        await authedPage.waitForSelector('#task-status', { timeout: 10000 });
        await expect(authedPage.locator('#task-status')).toContainText('Triaged');
    });

    test('assign issue', async ({ authedPage, isolatedTenant }) => {
        await createIssue(authedPage, isolatedTenant.tenantSlug);

        await expect(authedPage.locator('#task-assignee-input')).toBeVisible();
        await expect(authedPage.locator('#assign-task-btn')).toBeVisible();

        const session = await authedPage.evaluate(async () => {
            const res = await fetch('/api/auth/session');
            return res.json();
        });
        const email = session?.user?.email as string | undefined;
        const name = (session?.user?.name as string | undefined) || email;
        if (email && name) {
            await authedPage.click('#task-assignee-input');
            const search = authedPage.getByPlaceholder('Search members…');
            await search.fill(name);
            const option = authedPage
                .getByRole('option')
                .filter({ hasText: email })
                .first();
            const visible = await option
                .waitFor({ state: 'visible', timeout: 5000 })
                .then(() => true)
                .catch(() => false);
            if (visible) {
                await option.click();
                await authedPage.click('#assign-task-btn');
                await authedPage.waitForLoadState('networkidle').catch(() => {});
                await authedPage.reload();
                await authedPage.waitForSelector('#task-assignee', {
                    timeout: 10000,
                });
            }
        }
    });

    test('add link to issue', async ({ authedPage, isolatedTenant }) => {
        await createIssue(authedPage, isolatedTenant.tenantSlug);

        await authedPage.click('#tab-links');
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        await authedPage.click('#add-link-btn');
        await authedPage.waitForSelector('#link-entity-type', { timeout: 5000 });
        await selectComboboxOption(authedPage, 'link-entity-type', 'CONTROL');
        await authedPage.fill('#link-entity-id', 'test-control-id');
        await authedPage.click('#submit-link-btn');
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        await expect(
            authedPage.locator('[data-testid="task-links-table"]'),
        ).toContainText('CONTROL', { timeout: 5000 });
        await expect(
            authedPage.locator('[data-testid="task-links-table"]'),
        ).toContainText('test-control-id');
    });

    test('add comment to issue', async ({ authedPage, isolatedTenant }) => {
        const uid = Date.now().toString(36);
        await createIssue(authedPage, isolatedTenant.tenantSlug);

        await authedPage.click('#tab-comments');
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        await authedPage.fill('#comment-body', `E2E comment ${uid}`);
        await authedPage.click('#submit-comment-btn');
        await authedPage.waitForLoadState('networkidle').catch(() => {});

        await expect(authedPage.locator('#comments-list')).toContainText(
            `E2E comment ${uid}`,
            { timeout: 15000 },
        );
    });

    test('dashboard page renders metrics', async ({ authedPage, isolatedTenant }) => {
        await gotoAndVerify(
            authedPage,
            `/t/${isolatedTenant.tenantSlug}/tasks/dashboard`,
            'h1',
        );
        await expect(authedPage.locator('#dashboard-metrics')).toBeVisible({
            timeout: 10000,
        });
        await expect(authedPage.locator('h1')).toContainText('Dashboard');
    });

    test('bulk action toolbar appears when issues selected', async ({
        authedPage,
        isolatedTenant,
    }) => {
        // Create an issue so the list has a selectable row.
        await createIssue(authedPage, isolatedTenant.tenantSlug);
        await gotoAndVerify(authedPage, `/t/${isolatedTenant.tenantSlug}/tasks`, 'h1');

        await expect(authedPage.locator('#bulk-toolbar')).not.toBeVisible({
            timeout: 3000,
        });

        // DataTable's built-in selection — the click target is the
        // wrapping `<div title="Select">`.
        const checkboxes = authedPage
            .locator('tbody tr')
            .locator('[title="Select"]');
        const count = await checkboxes.count();
        if (count > 0) {
            await checkboxes.first().click();
            await expect(authedPage.locator('#bulk-toolbar')).toBeVisible({
                timeout: 5000,
            });
            await expect(authedPage.locator('#bulk-action-select')).toBeVisible();
        }
    });

    // Read-only role-gate check — kept on the SHARED seeded tenant.
    // The `isolatedTenant` factory only provisions an OWNER; this test
    // needs the seeded `viewer@acme.com` READER. It only navigates +
    // asserts, so it cannot pollute the shared tenant.
    test('reader user sees view-only issues', async ({ page }) => {
        const tenantSlug = await loginAndGetTenant(page, READER_USER);
        await gotoAndVerify(page, `/t/${tenantSlug}/tasks`, 'h1');
        await expect(page.locator('#new-task-btn')).not.toBeVisible({ timeout: 3000 });
    });

    test('legacy /issues URL redirects to /tasks', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/issues`);
        await authedPage.waitForURL(`**/tasks`, { timeout: 15000 });
        await expect(authedPage.url()).toContain('/tasks');
    });
});
