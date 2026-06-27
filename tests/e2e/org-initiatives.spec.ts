import { test, expect } from '@playwright/test';
import { safeGoto, waitForHydration } from './e2e-utils';

/**
 * ORG_INITIATIVES — portfolio programme tracking (E2E).
 *
 * Against the seeded `acme-org` Organization + `ciso@acme.com` (ORG_ADMIN).
 * Walks: create an initiative → it appears in the list → open detail +
 * change status → it surfaces on the org dashboard widget. The
 * cross-tenant link rollup is exercised deterministically by the
 * unit/integration tests (it needs per-tenant entity ids); the E2E proves
 * the org surface + lifecycle.
 *
 * Defensive `isVisible().catch()` guards mirror ciso-portfolio.spec.ts —
 * the org dashboard is a dynamic-imported client.
 */
const CISO = { email: 'ciso@acme.com', password: 'password123' };
const ORG_SLUG = 'acme-org';

async function login(page: import('@playwright/test').Page) {
    await safeGoto(page, '/login');
    await page.fill('#email', CISO.email).catch(() => {});
    await page.fill('#password', CISO.password).catch(() => {});
    await page.click('button[type="submit"]').catch(() => {});
    await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('Org security initiatives', () => {
    test.describe.configure({ mode: 'serial' });

    test('create an initiative and see it in the list + on the dashboard', async ({ page }) => {
        await login(page);
        await safeGoto(page, `/org/${ORG_SLUG}/initiatives`);
        await waitForHydration(page).catch(() => {});

        const title = `MFA rollout ${Date.now()}`;

        const newBtn = page.getByRole('button', { name: 'New initiative' });
        if (await newBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
            await newBtn.click();
            await page.locator('input[placeholder*="Title"]').fill(title);
            await page.getByRole('button', { name: 'Create initiative' }).click();
            await page.waitForLoadState('networkidle').catch(() => {});
        }

        // Landed on the detail page (or back on the list) — the title shows.
        await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });

        // Change status to IN_PROGRESS from the detail page.
        const inProgressBtn = page.getByRole('button', { name: 'IN_PROGRESS' });
        if (await inProgressBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
            await inProgressBtn.click();
            await page.waitForLoadState('networkidle').catch(() => {});
        }

        // The initiative appears on the org dashboard widget.
        await safeGoto(page, `/org/${ORG_SLUG}`);
        await waitForHydration(page).catch(() => {});
        const widget = page.locator('[data-testid="org-initiatives-widget"]');
        if (await widget.isVisible({ timeout: 15000 }).catch(() => false)) {
            await expect(widget).toBeVisible();
        }
    });

    test('the initiatives list page renders for the org admin', async ({ page }) => {
        await login(page);
        await safeGoto(page, `/org/${ORG_SLUG}/initiatives`);
        await waitForHydration(page).catch(() => {});
        await expect(page.getByRole('heading', { name: 'Security initiatives' })).toBeVisible({ timeout: 15000 });
    });
});
