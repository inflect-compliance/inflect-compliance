import { test, expect } from '@playwright/test';
import {
    createIsolatedTenant,
    gotoAndVerify,
    signInAs,
    type IsolatedTenantCredentials,
} from './e2e-utils';

/**
 * NIS2 self-assessment onboarding step E2E.
 *
 * Two paths, each on its own isolated tenant (onboarding state is
 * per-tenant; provisioned once per describe in beforeAll, which the
 * e2e-isolation guard permits):
 *
 *   1. WITH NIS2 selected → the conditional step APPEARS, answers
 *      autosave + persist across reload, the step is skippable, and the
 *      assessment is resumable from the framework view.
 *   2. WITHOUT NIS2 → the step is NEVER shown and the visible-step count
 *      excludes it (so progress can reach 100%).
 *
 * Defensive `isVisible().catch()` guards mirror the existing
 * onboarding.spec.ts — the wizard is a dynamic-imported client that
 * fetches on mount.
 */

async function startAndCompleteCompanyProfile(page: import('@playwright/test').Page, slug: string) {
    await gotoAndVerify(page, `/t/${slug}/onboarding`, 'main');
    await page.waitForLoadState('networkidle').catch(() => {});

    // Welcome screen → Start Setup (only on a fresh, NOT_STARTED wizard).
    const startBtn = page.locator('button:has-text("Start Setup")');
    if (await startBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
        await startBtn.click();
        await page.waitForLoadState('networkidle').catch(() => {});
    }

    // Company Profile — the Company Name is REQUIRED to complete the step.
    // The first onboarding hit can cold-compile slowly, so wait for the
    // input (don't skip it) and fill it deterministically.
    const nameInput = page.locator('[data-testid="company-name"]');
    await nameInput.waitFor({ state: 'visible', timeout: 20000 });
    await nameInput.fill('Acme Corporation');

    // Continue → advance to the Frameworks step. The first cold "complete"
    // can race the React state update (the API 200s but activeStepIdx hasn't
    // advanced yet), so RETRY the click until a framework card actually
    // renders — proof the wizard left Company Profile.
    const frameworkCard = page
        .locator('[data-testid="fw-nis2"], [data-testid="fw-iso27001"]')
        .first();
    await expect(async () => {
        if (!(await frameworkCard.isVisible().catch(() => false))) {
            await page.locator('button:has-text("Continue")').first().click();
        }
        await expect(frameworkCard).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 40000 });
}

test.describe('NIS2 self-assessment — NIS2 selected', () => {
    test.describe.configure({ mode: 'serial' });
    let tenant: IsolatedTenantCredentials;

    test.beforeAll(async ({ request }) => {
        tenant = await createIsolatedTenant({ request, namePrefix: 'nis2-on' });
    });

    test('the step appears after selecting NIS2 and autosaves answers', async ({ page }) => {
        const slug = await signInAs(page, tenant);
        await startAndCompleteCompanyProfile(page, slug);

        // Frameworks step → pick NIS2 (lowercase key in the picker).
        const nis2Card = page.locator('[data-testid="fw-nis2"]');
        await nis2Card.waitFor({ state: 'visible', timeout: 15000 });
        await nis2Card.click();
        await page.locator('button:has-text("Continue")').click();
        await page.waitForLoadState('networkidle').catch(() => {});

        // The conditional step is now present in the rail + content.
        await expect(page.locator('[data-testid="step-nav-NIS2_SELF_ASSESSMENT"]')).toBeVisible({ timeout: 15000 });
        const step = page.locator('[data-testid="nis2-self-assessment"]');
        await expect(step).toBeVisible({ timeout: 15000 });

        // Attribution (CC BY 4.0) must render wherever questions show.
        await expect(step.getByText(/CC BY 4\.0/)).toBeVisible();

        // Expand the first domain + answer a couple of questions.
        const firstDomain = step.getByRole('button').first();
        await firstDomain.click().catch(() => {});
        const radios = step.getByRole('radio');
        const count = await radios.count();
        expect(count).toBeGreaterThan(0);
        await radios.nth(0).click();
        if (count > 4) await radios.nth(5).click();
        // Let autosave PUTs settle.
        await page.waitForTimeout(1000);

        // Reload → answers persist (progress shows > 0 answered).
        await gotoAndVerify(page, `/t/${slug}/onboarding`, 'main');
        await page.waitForLoadState('networkidle').catch(() => {});
        const stepAfter = page.locator('[data-testid="nis2-self-assessment"]');
        await expect(stepAfter).toBeVisible({ timeout: 15000 });
        await expect(stepAfter.getByText(/[1-9]\d*\/\d+ answered/)).toBeVisible({ timeout: 10000 });
    });

    test('the step is skippable and resumable from the framework view', async ({ page }) => {
        const slug = await signInAs(page, tenant);
        await gotoAndVerify(page, `/t/${slug}/onboarding`, 'main');
        await page.waitForLoadState('networkidle').catch(() => {});

        const step = page.locator('[data-testid="nis2-self-assessment"]');
        if (await step.isVisible({ timeout: 10000 }).catch(() => false)) {
            await page.getByRole('button', { name: 'Skip for now' }).first().click();
            // Confirm in the inline two-step.
            await page.getByRole('button', { name: 'Skip for now' }).first().click().catch(() => {});
            await page.waitForLoadState('networkidle').catch(() => {});
        }

        // Resume-later surface: the framework view route.
        await gotoAndVerify(page, `/t/${slug}/frameworks/nis2/self-assessment`, 'main');
        await page.waitForLoadState('networkidle').catch(() => {});
        await expect(page.locator('[data-testid="nis2-self-assessment"]')).toBeVisible({ timeout: 15000 });
    });
});

test.describe('NIS2 self-assessment — NIS2 NOT selected', () => {
    test.describe.configure({ mode: 'serial' });
    let tenant: IsolatedTenantCredentials;

    test.beforeAll(async ({ request }) => {
        tenant = await createIsolatedTenant({ request, namePrefix: 'nis2-off' });
    });

    test('the step is never shown when NIS2 is not selected', async ({ page }) => {
        const slug = await signInAs(page, tenant);
        await startAndCompleteCompanyProfile(page, slug);

        // Pick ISO 27001 only (NOT NIS2).
        const isoCard = page.locator('[data-testid="fw-iso27001"]');
        await isoCard.waitFor({ state: 'visible', timeout: 15000 });
        await isoCard.click();
        await page.locator('button:has-text("Continue")').click();
        await page.waitForLoadState('networkidle').catch(() => {});

        // The NIS2 step must NOT exist in the rail or content.
        await expect(page.locator('[data-testid="step-nav-NIS2_SELF_ASSESSMENT"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="nis2-self-assessment"]')).toHaveCount(0);

        // Completing FRAMEWORK_SELECTION advanced straight to Assets (the
        // NIS2 step is absent, so the visible-step count is 7). `.first()`
        // because the step label "Assets" + the "Step n of 7" caption both
        // match — either being present proves the advance.
        await expect(page.getByText(/Assets|Step \d+ of 7/).first()).toBeVisible({ timeout: 10000 });
    });
});
