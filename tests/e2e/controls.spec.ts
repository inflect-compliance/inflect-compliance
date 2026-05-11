import { test, expect, Page } from '@playwright/test';
import { loginAndGetTenant } from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

test.describe('Controls Center', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    let controlDetailPath: string;
    const uniqueId = Date.now().toString(36);

    test('controls list page loads with filters and CTAs', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('h1', { timeout: 15000 });
        await expect(page.locator('#new-control-btn')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#install-templates-btn')).toBeVisible();
        await expect(page.locator('#control-search')).toBeVisible();
        // Epic 53: the per-field `#control-status-filter` dropdown has been
        // replaced by the consolidated FilterSelect picker. Assert the picker
        // trigger is visible (the shared primitive renders a `ListFilter`
        // icon + the "Filter" label).
        await expect(page.getByRole('button', { name: /filter/i }).first()).toBeVisible();
    });

    test('create a new control and see detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls/new`);
        await page.waitForSelector('#control-name-input', { timeout: 10000 });

        await page.fill('#control-name-input', `E2E Control ${uniqueId}`);
        await page.fill('#control-code-input', `CTRL-${uniqueId}`);
        await page.fill('#control-description-input', 'Test control from e2e');
        await page.click('#create-control-btn');

        // Wait for navigation to the control detail page (UUID-like segment, not /new)
        await page.waitForSelector('#control-title', { timeout: 15000 });
        await expect(page.locator('#control-title')).toContainText(`E2E Control ${uniqueId}`, { timeout: 5000 });
        await expect(page.locator('#control-status')).toBeVisible();
        // Store the detail URL path for subsequent serial tests
        controlDetailPath = new URL(page.url()).pathname;
    });

    test('open control → create task → mark done', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Create a control inline so this test is self-sufficient when run alone
        if (!controlDetailPath) {
            await page.goto(`/t/${tenantSlug}/controls/new`);
            await page.waitForSelector('#control-name-input', { timeout: 15000 });
            const taskUniqueId = Date.now().toString(36);
            await page.fill('#control-name-input', `Task Test ${taskUniqueId}`);
            await page.fill('#control-code-input', `TSK-${taskUniqueId}`);
            await page.click('#create-control-btn');
            await page.waitForSelector('#control-title', { timeout: 15000 });
            controlDetailPath = new URL(page.url()).pathname;
        } else {
            await page.goto(controlDetailPath);
            await page.waitForSelector('#control-title', { timeout: 15000 });
        }

        // Go to tasks tab
        await page.click('#tab-tasks');
        await page.waitForSelector('#create-task-btn', { timeout: 5000 });

        // Create task
        await page.click('#create-task-btn');
        await page.waitForSelector('#task-title-input', { timeout: 5000 });
        await page.fill('#task-title-input', `E2E Task ${uniqueId}`);
        // Create task — wait for the API response before asserting
        await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/tasks') && resp.request().method() === 'POST', { timeout: 15000 }),
            page.click('#submit-task-btn'),
        ]);

        // Verify task appears (refetch + re-render can be slow under load)
        await expect(page.locator('[data-testid="control-tasks-table"]')).toContainText(`E2E Task ${uniqueId}`, { timeout: 15000 });

        // Mark done - wait for the PATCH API call to complete before asserting
        const doneBtn = page.locator('button:has-text("Done")').first();
        await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/tasks/') && resp.request().method() === 'PATCH', { timeout: 10000 }),
            doneBtn.click(),
        ]);
        // Wait for refetch + re-render to show the updated status badge
        await expect(page.locator('[data-testid="control-tasks-table"]')).toContainText('DONE', { timeout: 10000 });
    });

    test('attach evidence → see it listed', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // Navigate directly to the control detail page
        await page.goto(controlDetailPath);
        await page.waitForSelector('#control-title', { timeout: 15000 });

        // Go to evidence tab
        await page.click('#tab-evidence');
        await page.waitForSelector('#link-evidence-btn', { timeout: 5000 });

        // Link evidence
        await page.click('#link-evidence-btn');
        await page.waitForSelector('#evidence-url-input', { timeout: 5000 });
        await page.fill('#evidence-url-input', 'https://docs.example.com/evidence-report');
        await page.fill('#evidence-note-input', 'E2E evidence note');
        // Wait for the POST API call to complete before asserting
        await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/evidence') && resp.request().method() === 'POST', { timeout: 10000 }),
            page.click('#submit-evidence-btn'),
        ]);

        // Verify evidence appears after refetch + re-render
        await expect(page.locator('#evidence-table')).toContainText('docs.example.com', { timeout: 10000 });
    });

    test('mark NOT_APPLICABLE requires justification', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // Navigate directly to the control detail page
        await page.goto(controlDetailPath);
        await page.waitForSelector('#control-title', { timeout: 15000 });

        // Click applicability toggle
        await page.click('#toggle-applicability-btn');
        await page.waitForSelector('input[value="NOT_APPLICABLE"]', { timeout: 5000 });

        // Select Not Applicable
        await page.click('input[value="NOT_APPLICABLE"]');
        await page.waitForSelector('#applicability-justification', { timeout: 3000 });

        // Try to save without justification -> button should be disabled
        const saveBtn = page.locator('#save-applicability-btn');
        await expect(saveBtn).toBeDisabled();

        // Fill justification and save — wait for the API response
        await page.fill('#applicability-justification', 'Not in scope for this compliance cycle');
        await expect(saveBtn).toBeEnabled();
        await Promise.all([
            page.waitForResponse(resp => resp.url().includes('/applicability') && resp.request().method() === 'POST', { timeout: 15000 }),
            saveBtn.click(),
        ]);

        // Verify N/A badge after refetch
        await expect(page.locator('#control-applicability')).toContainText('Not Applicable', { timeout: 10000 });
    });

    test('reader user sees view-only controls', async ({ page }) => {
        // Login as reader
        await page.goto('/login');
        await page.waitForSelector('input[type="email"][name="email"]', { timeout: 60000 });
        await page.fill('input[type="email"][name="email"]', 'viewer@acme.com');
        await page.fill('#credentials-form input[type="password"]', 'password123');
        await page.click('#credentials-form button[type="submit"]');
        await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 30000 });
        const url = new URL(page.url());
        const match = url.pathname.match(/^\/t\/([^/]+)\//);
        tenantSlug = match?.[1] || tenantSlug;

        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });

        // Reader should NOT see create buttons
        await expect(page.locator('#new-control-btn')).not.toBeVisible({ timeout: 3000 });
        await expect(page.locator('#install-templates-btn')).not.toBeVisible({ timeout: 3000 });
    });
});
