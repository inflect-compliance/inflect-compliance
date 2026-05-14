import { test, expect, Page } from '@playwright/test';
import { loginAndGetTenant, gotoAndVerify, safeGoto } from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

test.describe('Policy Center', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;
    let createdPolicyTitle: string;
    let createdPolicyPath: string;
    const uniqueId = Date.now().toString(36);

    test('policies list page loads with controls', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/policies`, 'h1');
        await expect(page.locator('#new-policy-btn')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#policy-from-template-btn')).toBeVisible();
        // R14 (#443) removed the FilterToolbar text-search input from every
        // list page — the navbar ⌘K palette is the sole search affordance
        // now. No `#policy-search` element to assert.
    });

    test('template library page loads', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await gotoAndVerify(page, `/t/${tenantSlug}/policies/templates`, 'h1');
        await expect(page.locator('h1')).toContainText('Policy Templates');
        // R14 (#443) removed the FilterToolbar text-search input from the
        // templates page too — no `#template-search` element to assert.
    });

    test('create a blank policy and see detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        createdPolicyTitle = `E2E Test Policy ${uniqueId}`;
        await gotoAndVerify(page, `/t/${tenantSlug}/policies/new`, '#policy-title-input');

        await page.fill('#policy-title-input', createdPolicyTitle);
        await page.fill('#policy-content-input', '# Test Policy\n\nThis is a test policy created by e2e.');
        await page.click('#create-policy-btn');

        await page.waitForURL('**/policies/**', { timeout: 30000 });
        // Policy detail page + API route require JIT compilation on first access
        await page.waitForSelector('#policy-title', { timeout: 60000 });
        await expect(page.locator('#policy-title')).toContainText(createdPolicyTitle);
        await expect(page.locator('#policy-status')).toContainText('DRAFT');
        // Capture the detail URL for use in subsequent serial tests
        createdPolicyPath = new URL(page.url()).pathname;
    });

    test('create version via editor and view history', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // Navigate directly to the policy detail page using saved path
        await safeGoto(page, createdPolicyPath);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#policy-title', { timeout: 30000 });

        await page.click('#new-version-btn');
        await page.waitForSelector('#version-editor', { timeout: 15000 });

        // Epic 45 migrated to Tiptap-backed `<RichTextEditor>` — the
        // `id="version-editor"` now sits on the wrapper `<div>`. The
        // actual fillable element is the inner Markdown `<textarea>`,
        // exposed via `data-testid="rich-text-editor-textarea"`.
        await page.fill('[data-testid="rich-text-editor-textarea"]', '# Updated Policy\n\nVersion 2 of the policy.');
        await page.fill('#change-summary-input', 'Updated for e2e test');
        await page.click('#save-version-btn');

        await page.waitForSelector('#version-history', { timeout: 30000 });
        await expect(page.locator('#version-history')).toContainText('v2');
    });

    test('create external link version', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // Navigate directly to the policy detail page using saved path
        await safeGoto(page, createdPolicyPath);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#policy-title', { timeout: 30000 });

        // Open editor
        await page.click('#new-version-btn');
        await page.waitForSelector('#version-editor', { timeout: 15000 });

        // Switch to external link mode
        await page.click('#mode-external_link');
        await page.waitForSelector('#external-url-input', { timeout: 3000 });

        await page.fill('#external-url-input', 'https://docs.example.com/policy-v3');
        await page.fill('#change-summary-input', 'Added external doc link');
        await page.click('#save-version-btn');

        // Should show in version history
        await page.waitForSelector('#version-history', { timeout: 30000 });
        await expect(page.locator('#version-history')).toContainText('External Link');
    });

    test('activity feed tab loads', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);

        // Create a policy inline so this test is self-sufficient when run alone
        if (!createdPolicyTitle) {
            createdPolicyTitle = `E2E Activity Policy ${Date.now().toString(36)}`;
            await gotoAndVerify(page, `/t/${tenantSlug}/policies/new`, '#policy-title-input');
            await page.fill('#policy-title-input', createdPolicyTitle);
            await page.fill('#policy-content-input', '# Activity Test Policy\n\nCreated for activity feed test.');
            await page.click('#create-policy-btn');
            await page.waitForURL('**/policies/**', { timeout: 30000 });
            await page.waitForSelector('#policy-title', { timeout: 30000 });
            createdPolicyPath = new URL(page.url()).pathname;
        } else {
            // Navigate directly to the policy detail page using saved path
            await safeGoto(page, createdPolicyPath, { waitUntil: 'domcontentloaded' });
            await page.waitForLoadState('networkidle').catch(() => {});
            await page.waitForSelector('#policy-title', { timeout: 30000 });
        }

        await page.click('#tab-activity');
        await page.waitForLoadState('networkidle').catch(() => {});

        // The activity API route needs JIT compilation on first visit (dev server).
        // The #activity-feed container renders immediately (even during loading),
        // so we must wait for the actual CREATED text to appear, not just the container.
        let createdVisible = false;
        for (let attempt = 0; attempt < 2 && !createdVisible; attempt++) {
            try {
                await expect(page.locator('#activity-feed')).toContainText('CREATED', { timeout: 30000 });
                createdVisible = true;
            } catch {
                // Retry: reload and re-click the Activity tab
                await page.reload({ waitUntil: 'domcontentloaded' });
                await page.waitForLoadState('networkidle').catch(() => {});
                await page.waitForSelector('#policy-title', { timeout: 15000 });
                await page.click('#tab-activity');
                await page.waitForLoadState('networkidle').catch(() => {});
            }
        }

        // Should show the activity feed with the POLICY_CREATED event
        await expect(page.locator('#activity-feed')).toBeVisible({ timeout: 10000 });
        await expect(page.locator('#activity-feed')).toContainText('CREATED', { timeout: 10000 });
    });

    test('policy detail shows role-gated action buttons', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        // Navigate directly to the policy detail page using saved path
        await safeGoto(page, createdPolicyPath);
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#policy-title', { timeout: 30000 });

        // Admin should see action buttons
        await expect(page.locator('#new-version-btn')).toBeVisible({ timeout: 5000 });
        await expect(page.locator('#archive-btn')).toBeVisible({ timeout: 5000 });
    });
});
