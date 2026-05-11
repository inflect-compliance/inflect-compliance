import { test, expect, Page } from '@playwright/test';
import { loginAndGetTenant } from './e2e-utils';

const TEST_USER = { email: 'admin@acme.com', password: 'password123' };

test.describe('Control Edit Modal', () => {
    test.describe.configure({ mode: 'serial' });

    let tenantSlug: string;

    test('admin sees Edit button on control detail', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 30000 });

        // Click first control link
        const firstLink = page.locator('#controls-table tbody tr a[id^="control-link-"]').first();
        await firstLink.waitFor({ state: 'visible', timeout: 15000 });
        await firstLink.click();
        
        // Wait for page transition and hydration — control detail page is large (995 LOC)
        // and requires JIT compilation on first access in dev mode
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#control-title', { timeout: 30000 });

        // Edit button should be visible
        await expect(page.locator('[data-testid="control-edit-button"]')).toBeVisible({ timeout: 5000 });
    });

    test('Edit button opens modal and saves title change', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 30000 });

        // Click first control
        const firstLink = page.locator('#controls-table tbody tr a[id^="control-link-"]').first();
        await firstLink.waitFor({ state: 'visible', timeout: 15000 });
        await firstLink.click();
        
        // Wait for page transition and hydration
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#control-title', { timeout: 30000 });

        // Record original title
        const originalTitle = (await page.locator('#control-title').textContent())!.trim();

        // Click Edit (Ensure button is ready)
        const editBtn = page.locator('[data-testid="control-edit-button"]');
        await editBtn.waitFor({ state: 'visible' });
        await editBtn.click();
        await expect(page.locator('[data-testid="control-edit-dialog"]')).toBeVisible({ timeout: 5000 });

        // Name input should have the original title
        const nameInput = page.locator('[data-testid="edit-name-input"]');
        await expect(nameInput).toHaveValue(originalTitle);

        // Change title
        const newTitle = `${originalTitle} (edited)`;
        await nameInput.fill(newTitle);

        // Save
        await page.locator('[data-testid="edit-save-button"]').click();
        await expect(page.locator('[data-testid="control-edit-dialog"]')).toBeHidden({ timeout: 5000 });

        // Verify title updated
        await expect(page.locator('#control-title')).toContainText('(edited)', { timeout: 5000 });

        // Success toast should appear
        await expect(page.locator('#edit-success-toast')).toBeVisible({ timeout: 3000 });

        // Restore original title
        const editBtn2 = page.locator('[data-testid="control-edit-button"]');
        await editBtn2.waitFor({ state: 'visible' });
        await editBtn2.click();
        await expect(page.locator('[data-testid="control-edit-dialog"]')).toBeVisible({ timeout: 5000 });
        await nameInput.fill(originalTitle);
        await page.locator('[data-testid="edit-save-button"]').click();
        await expect(page.locator('[data-testid="control-edit-dialog"]')).toBeHidden({ timeout: 5000 });
    });

    test('Cancel closes modal without saving', async ({ page }) => {
        tenantSlug = await loginAndGetTenant(page);
        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('#controls-table', { timeout: 30000 });

        const firstLink = page.locator('#controls-table tbody tr a[id^="control-link-"]').first();
        await firstLink.waitFor({ state: 'visible', timeout: 15000 });
        await firstLink.click();
        
        await page.waitForLoadState('networkidle').catch(() => {});
        await page.waitForSelector('#control-title', { timeout: 30000 });

        const originalTitle = (await page.locator('#control-title').textContent())!.trim();

        // Open edit modal
        const editBtn = page.locator('[data-testid="control-edit-button"]');
        await editBtn.waitFor({ state: 'visible' });
        await editBtn.click();
        await expect(page.locator('[data-testid="control-edit-dialog"]')).toBeVisible({ timeout: 5000 });

        // Change title
        await page.locator('[data-testid="edit-name-input"]').fill('This should not save');

        // Cancel
        await page.locator('[data-testid="edit-cancel-button"]').click();
        await expect(page.locator('[data-testid="control-edit-dialog"]')).toBeHidden({ timeout: 3000 });

        // Title should be unchanged
        await expect(page.locator('#control-title')).toHaveText(originalTitle);
    });

    test('reader user does not see Edit button', async ({ page }) => {
        await page.goto('/login');
        await page.waitForSelector('input[type="email"][name="email"]', { timeout: 60000 });
        await page.fill('input[type="email"][name="email"]', 'viewer@acme.com');
        await page.fill('#credentials-form input[type="password"]', 'password123');
        await page.click('#credentials-form button[type="submit"]');
        await page.waitForURL(/\/t\/[^/]+\/dashboard/, { timeout: 15000 });
        const url = new URL(page.url());
        const match = url.pathname.match(/^\/t\/([^/]+)\//);
        tenantSlug = match?.[1] || tenantSlug;

        await page.goto(`/t/${tenantSlug}/controls`);
        await page.waitForSelector('h1', { timeout: 10000 });

        // Try to find a control link — readers may not see a table at all depending on if controls exist
        const firstLink = page.locator('#controls-table tbody tr a[id^="control-link-"]').first();
        if (await firstLink.isVisible({ timeout: 3000 }).catch(() => false)) {
            await firstLink.click();
            await page.waitForSelector('#control-title', { timeout: 10000 });
            // Reader should NOT see edit button
            await expect(page.locator('[data-testid="control-edit-button"]')).not.toBeVisible({ timeout: 3000 });
        }
    });
});
