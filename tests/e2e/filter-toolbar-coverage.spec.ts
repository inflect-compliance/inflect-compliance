/**
 * E2E — FilterToolbar clear-chip round-trip (quality roadmap P4,
 * item 3).
 *
 * `filters.spec.ts` covers the "apply → URL gains the param" path.
 * The clearing path — the user removes an active filter chip and
 * the URL gives the param back — is the genuine gap. This spec
 * pins the round-trip end-to-end.
 */
import { test, expect } from '@playwright/test';
import { loginAndGetTenant, safeGoto } from './e2e-utils';

test.describe('FilterToolbar coverage', () => {
    test('applying and clearing a filter chip round-trips through the URL', async ({
        page,
    }) => {
        const tenantSlug = await loginAndGetTenant(page);
        await safeGoto(page, `/t/${tenantSlug}/tasks?type=ANY_REVIEW`, {
            waitUntil: 'domcontentloaded',
        });
        await page.waitForLoadState('networkidle').catch(() => {});

        // The filter applied via the URL surfaces as an active chip.
        const chip = page
            .getByRole('button')
            .filter({ hasText: /any.review|type/i })
            .first();
        await expect(chip).toBeVisible({ timeout: 15_000 });
        expect(page.url()).toContain('type=ANY_REVIEW');

        // Clicking the chip's clear control (the FilterToolbar exposes a
        // dedicated "Clear filters" affordance once filters are active)
        // removes the URL param. We use the bulk "Clear" affordance
        // for resilience — chip-internal × buttons drift across the
        // R10 polish rounds; the bulk clear is structurally stable.
        const clearAll = page
            .getByRole('button', { name: /clear filters|clear all/i })
            .first();
        await clearAll.click();

        await expect.poll(() => page.url(), { timeout: 5_000 }).not.toContain(
            'type=ANY_REVIEW',
        );
    });
});
