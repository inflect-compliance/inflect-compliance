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

    // Wait for the dynamically-imported wizard to become interactive before
    // probing — racing the lazy import was the source of fw-card flakes.
    const startBtn = page.locator('button:has-text("Start Setup")');
    const wizard = page.locator('[data-testid="onboarding-wizard"]');
    await startBtn.or(wizard).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});

    if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click();
        await page.waitForLoadState('networkidle').catch(() => {});
    }

    const nameInput = page.locator('[data-testid="company-name"]');
    if (await nameInput.isVisible({ timeout: 10000 }).catch(() => false)) {
        await nameInput.fill('Acme Corporation');
    }
    const continueBtn = page.getByRole('main').locator('button:has-text("Continue")');
    if (await continueBtn.isVisible({ timeout: 10000 }).catch(() => false)) {
        await continueBtn.click();
        await page.waitForLoadState('networkidle').catch(() => {});
    }
    // Guarantee the Frameworks step is reached before the spec proceeds —
    // any `fw-*` card proves the step loaded (generous budget for CI).
    await page
        .locator('[data-testid^="fw-"]')
        .first()
        .waitFor({ state: 'visible', timeout: 25000 })
        .catch(() => {});
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
        await nis2Card.waitFor({ state: 'visible', timeout: 20000 });
        await nis2Card.click();
        await page.getByRole('main').locator('button:has-text("Continue")').click();
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
        await isoCard.waitFor({ state: 'visible', timeout: 20000 });
        await isoCard.click();
        await page.getByRole('main').locator('button:has-text("Continue")').click();
        await page.waitForLoadState('networkidle').catch(() => {});

        // The NIS2 step must NOT exist in the rail or content (core claim).
        await expect(page.locator('[data-testid="step-nav-NIS2_SELF_ASSESSMENT"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="nis2-self-assessment"]')).toHaveCount(0);

        // The denominator excludes the NIS2 step (7 visible steps, not 8) —
        // so a non-NIS2 tenant can reach 100%. Tolerant wait for the header.
        await expect(page.getByText(/of 7\b/).first()).toBeVisible({ timeout: 15000 });
    });
});
