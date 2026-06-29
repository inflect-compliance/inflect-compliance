/**
 * NIS2 Article 23 incident response — E2E happy path.
 *
 * Exercises the UI flow end-to-end: open the incidents list, create an
 * incident via the modal, land on its detail page, mark it reportable
 * (a human determination), and see the three Article 23 notification
 * deadlines appear.
 *
 * Isolation: runs on a fresh, empty tenant via the `isolatedTenant`
 * fixture (the OWNER has `incidents.manage`). All writes stay on the
 * isolated tenant. Selectors use existing `id` attributes — no
 * data-testid additions.
 */
import { test, expect } from './fixtures';
import { safeGoto } from './e2e-utils';

test.describe('NIS2 incident response', () => {
    test('create an incident, mark it reportable, see the Article 23 deadlines', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/incidents`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });

        // Open the create modal.
        const newBtn = authedPage.locator('#new-incident-btn').first();
        await newBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await newBtn.click();

        const titleInput = authedPage.locator('#incident-title-input');
        await expect(titleInput).toBeVisible({ timeout: 60_000 });
        await titleInput.fill('Ransomware on the billing cluster');

        // Severity + type default to MEDIUM / OTHER — submit straight away.
        await authedPage.locator('#create-incident-btn').click();

        // Lands on the incident detail page.
        await authedPage.waitForURL(/\/incidents\/[a-z0-9]+$/i, { timeout: 60_000 });
        await expect(
            authedPage.getByRole('main').getByText('Ransomware on the billing cluster'),
        ).toBeVisible({ timeout: 30_000 });

        // The 7-phase tracker is present.
        await expect(
            authedPage.getByRole('main').getByLabel('7-phase incident response tracker'),
        ).toBeVisible();

        // Not reportable yet → mark it reportable (human determination).
        const markBtn = authedPage.locator('#mark-reportable-btn');
        await markBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await markBtn.click();

        // Confirm in the modal.
        const confirm = authedPage.getByRole('button', { name: 'Mark reportable' }).last();
        await confirm.click();

        // The three Article 23 deadlines now render.
        await expect(
            authedPage.getByRole('main').getByText('24-hour early warning'),
        ).toBeVisible({ timeout: 30_000 });
        await expect(
            authedPage.getByRole('main').getByText('72-hour detailed report'),
        ).toBeVisible();
        await expect(
            authedPage.getByRole('main').getByText('1-month final report'),
        ).toBeVisible();
    });
});
