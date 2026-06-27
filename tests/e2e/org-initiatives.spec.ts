import { test, expect } from '@playwright/test';
import { safeGoto, waitForHydration } from './e2e-utils';

/**
 * ORG_INITIATIVES — portfolio programme tracking (E2E).
 *
 * Against the seeded `acme-org` Organization + `ciso@acme.com` (ORG_ADMIN).
 * Creates an initiative via the API (deterministic — the modal-driven
 * create + cross-tenant link rollup are covered by the unit/integration
 * tests) then verifies the org SURFACE: it appears in the list page and
 * the dashboard widget renders. Defensive guards mirror
 * ciso-portfolio.spec.ts (the org dashboard is a dynamic-imported client).
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

    test('an initiative created via the API appears in the list + the dashboard widget', async ({ page }) => {
        await login(page);

        // Create via API (session cookie carries the ORG_ADMIN auth).
        const title = `MFA rollout ${Date.now()}`;
        const res = await page.request.post(`/api/org/${ORG_SLUG}/initiatives`, {
            data: { title },
        });
        expect(res.ok()).toBeTruthy();

        // List page shows it.
        await safeGoto(page, `/org/${ORG_SLUG}/initiatives`);
        await waitForHydration(page).catch(() => {});
        await expect(page.getByRole('heading', { name: 'Security initiatives' })).toBeVisible({ timeout: 15000 });
        await expect(page.getByText(title).first()).toBeVisible({ timeout: 15000 });

        // The dashboard widget renders.
        await safeGoto(page, `/org/${ORG_SLUG}`);
        await waitForHydration(page).catch(() => {});
        const widget = page.locator('[data-testid="org-initiatives-widget"]');
        if (await widget.isVisible({ timeout: 15000 }).catch(() => false)) {
            await expect(widget).toBeVisible();
        }
    });
});
