import { test, expect } from '@playwright/test';
import {
    createIsolatedTenant,
    gotoAndVerify,
    signInAs,
    type IsolatedTenantCredentials,
} from './e2e-utils';

/**
 * Unified AI-governance self-assessment onboarding step E2E.
 *
 * Two paths, each on its own isolated tenant (onboarding state is per-tenant):
 *   1. WITH the "we build/use AI systems" toggle → the conditional step
 *      APPEARS, the three coverage readouts render, the disclaimer renders, and
 *      the question UI is interactive.
 *   2. WITHOUT it (and no AI framework) → the step is NEVER shown and the
 *      visible-step count excludes it.
 *
 * Defensive `isVisible().catch()` guards mirror nis2-self-assessment.spec.ts —
 * the wizard is a dynamic-imported client that fetches on mount.
 */

async function startCompanyProfile(
    page: import('@playwright/test').Page,
    slug: string,
    opts: { usesAi: boolean },
) {
    await gotoAndVerify(page, `/t/${slug}/onboarding`, 'main');
    await page.waitForLoadState('networkidle').catch(() => {});

    const startBtn = page.locator('button:has-text("Start Setup")');
    const wizard = page.locator('[data-testid="onboarding-wizard"]');
    await startBtn.or(wizard).first().waitFor({ state: 'visible', timeout: 30000 }).catch(() => {});
    if (await startBtn.isVisible().catch(() => false)) {
        await startBtn.click();
        await page.waitForLoadState('networkidle').catch(() => {});
    }

    const nameInput = page.locator('[data-testid="company-name"]');
    await nameInput.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    if (await nameInput.isVisible().catch(() => false)) {
        await nameInput.fill('Acme Corporation');
    }
    if (opts.usesAi) {
        const aiToggle = page.locator('[data-testid="company-uses-ai"]');
        await aiToggle.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
        await aiToggle.check().catch(() => {});
    }

    // Continue → Frameworks (retry until a fw card renders — same anti-flake
    // pattern as the NIS2 spec).
    const frameworkCard = page.locator('[data-testid^="fw-"]').first();
    await expect(async () => {
        if (!(await frameworkCard.isVisible().catch(() => false))) {
            await page.getByRole('main').locator('button:has-text("Continue")').first().click();
        }
        await expect(frameworkCard).toBeVisible({ timeout: 4000 });
    }).toPass({ timeout: 45000 });

    // Pick ISO 27001 (NOT NIS2 — keeps the NIS2 step out of the way) + Continue.
    const isoCard = page.locator('[data-testid="fw-iso27001"]');
    await isoCard.waitFor({ state: 'visible', timeout: 20000 });
    await isoCard.click();
    await page.getByRole('main').locator('button:has-text("Continue")').click();
    await page.waitForLoadState('networkidle').catch(() => {});
}

test.describe('AI-governance self-assessment — AI systems flagged', () => {
    test.describe.configure({ mode: 'serial' });
    let tenant: IsolatedTenantCredentials;

    test.beforeAll(async ({ request }) => {
        tenant = await createIsolatedTenant({ request, namePrefix: 'aigov-on' });
    });

    test('the conditional step appears with the three coverage readouts', async ({ page }) => {
        const slug = await signInAs(page, tenant);
        await startCompanyProfile(page, slug, { usesAi: true });

        // The conditional step is now present in the rail + content.
        await expect(page.locator('[data-testid="step-nav-AI_GOVERNANCE_SELF_ASSESSMENT"]')).toBeVisible({ timeout: 20000 });
        const step = page.locator('[data-testid="ai-gov-self-assessment"]');
        await expect(step).toBeVisible({ timeout: 15000 });

        // The differentiator — three coverage cards.
        await expect(step.locator('[data-testid="ai-gov-coverage-cards"]')).toBeVisible();
        await expect(step.locator('[data-testid="ai-gov-cov-aisvs"]')).toBeVisible();
        await expect(step.locator('[data-testid="ai-gov-cov-iso42001"]')).toBeVisible();
        await expect(step.locator('[data-testid="ai-gov-cov-eu-ai-act"]')).toBeVisible();

        // Attribution + not-legal-advice disclaimer must render.
        await expect(step.locator('[data-testid="ai-gov-disclaimer"]')).toBeVisible();
        await expect(step.getByText(/CC-BY-SA-4\.0/).first()).toBeVisible();

        // The question UI is interactive (answer options render). Per-answer
        // autosave + the readout projection are covered deterministically by
        // the unit/guardrail tests; the E2E proves the conditional-visibility
        // + three-readout contract.
        await expect(step.getByRole('radio').first()).toBeVisible({ timeout: 10000 });
    });
});

test.describe('AI-governance self-assessment — no AI', () => {
    test.describe.configure({ mode: 'serial' });
    let tenant: IsolatedTenantCredentials;

    test.beforeAll(async ({ request }) => {
        tenant = await createIsolatedTenant({ request, namePrefix: 'aigov-off' });
    });

    test('the step is never shown when neither an AI framework nor the flag is set', async ({ page }) => {
        const slug = await signInAs(page, tenant);
        await startCompanyProfile(page, slug, { usesAi: false });

        // The AI-gov step must NOT exist in the rail or content (core claim).
        await expect(page.locator('[data-testid="step-nav-AI_GOVERNANCE_SELF_ASSESSMENT"]')).toHaveCount(0);
        await expect(page.locator('[data-testid="ai-gov-self-assessment"]')).toHaveCount(0);
    });
});
