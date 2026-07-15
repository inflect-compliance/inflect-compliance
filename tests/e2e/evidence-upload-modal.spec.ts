/**
 * Epic 54 — Evidence upload + create-text modals.
 *
 * Verifies the modal-first evidence flow that replaces the old
 * inline `glass-card` forms on the Evidence list page. The Upload
 * modal POSTs FormData to `/evidence/uploads`; the Text modal POSTs
 * JSON to `/evidence`; both invalidate the React-Query cache so the
 * list repopulates on success.
 *
 * Isolation: each `test()` runs on its own fresh, empty tenant via
 * the `isolatedTenant` fixture. The two "submitting creates
 * evidence" tests write rows that, on an isolated tenant, cannot
 * pollute the shared seeded tenant.
 *
 * All selectors use existing id attributes — no data-testid additions.
 */
import { test, expect } from './fixtures';
import { safeGoto, reloadUntilVisible } from './e2e-utils';

test.describe('Epic 54 — Evidence upload modal', () => {
    test('clicking Upload File opens the modal without navigating away', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/evidence`);
        await authedPage.waitForSelector('#add-evidence-btn', { timeout: 15000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        const listUrl = authedPage.url();

        // EP-3 — +Evidence is now a create menu; pick "File upload" to
        // reach the upload modal.
        await authedPage.click('#add-evidence-btn');
        await authedPage.click('#create-evidence-upload');

        await expect(authedPage.locator('#upload-form')).toBeVisible({
            timeout: 10000,
        });
        expect(authedPage.url()).toBe(listUrl);

        await authedPage.click('#upload-evidence-cancel-btn');
        await expect(authedPage.locator('#upload-form')).toBeHidden({ timeout: 5000 });
    });

    test('submit is disabled until a file is attached', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/evidence`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        const openBtn = authedPage.locator('#add-evidence-btn').first();
        await openBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        await openBtn.click();
        await authedPage.click('#create-evidence-upload'); // EP-3 create-menu → File upload
        await expect(authedPage.locator('#upload-form')).toBeVisible({
            timeout: 60_000,
        });

        await expect(authedPage.locator('#submit-upload-btn')).toBeDisabled();

        await authedPage.click('#upload-evidence-cancel-btn');
        await expect(authedPage.locator('#upload-form')).toBeHidden({ timeout: 5000 });
    });

    test('attaching a file and submitting POSTs to /evidence/uploads', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/evidence`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        const openBtn = authedPage.locator('#add-evidence-btn').first();
        await openBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        await openBtn.click();
        await authedPage.click('#create-evidence-upload'); // EP-3 create-menu → File upload
        await expect(authedPage.locator('#upload-form')).toBeVisible({
            timeout: 60_000,
        });

        const uid = Date.now().toString(36);
        const filename = `modal-evidence-${uid}.txt`;
        const payload = Buffer.from(`Epic 54 evidence upload ${uid}\n`);

        await authedPage.setInputFiles('#file-input', {
            name: filename,
            mimeType: 'text/plain',
            buffer: payload,
        });
        await authedPage.fill('#upload-title-input', `Modal Evidence ${uid}`);

        await expect(authedPage.locator('#submit-upload-btn')).toBeEnabled();

        const [response] = await Promise.all([
            authedPage.waitForResponse(
                (r) =>
                    r.url().includes('/api/t/') &&
                    r.url().includes('/evidence/uploads') &&
                    r.request().method() === 'POST',
            ),
            authedPage.click('#submit-upload-btn'),
        ]);
        expect(
            response.status(),
            'POST /evidence/uploads succeeded',
        ).toBeLessThan(400);

        await expect(authedPage.locator('#upload-form')).toBeHidden({
            timeout: 10000,
        });
        // The POST already succeeded above, so the row exists server-side; the
        // list-read cache can still serve a stale view under CI load, so
        // reload-poll past the 60s TTL until the row surfaces (anti-flake).
        await reloadUntilVisible(
            authedPage,
            authedPage.locator('#evidence-table').getByText(`Modal Evidence ${uid}`),
        );
    });

    test('Cancel closes the modal and leaves the list untouched', async ({
        authedPage,
        isolatedTenant,
    }) => {
        await safeGoto(authedPage, `/t/${isolatedTenant.tenantSlug}/evidence`);
        await authedPage.reload({ waitUntil: 'domcontentloaded' });
        const openBtn = authedPage.locator('#add-evidence-btn').first();
        await openBtn.waitFor({ state: 'visible', timeout: 15_000 });
        await authedPage.waitForLoadState('networkidle').catch(() => {});
        await openBtn.click();
        await authedPage.click('#create-evidence-upload'); // EP-3 create-menu → File upload
        await expect(authedPage.locator('#upload-form')).toBeVisible({
            timeout: 60_000,
        });

        await authedPage.click('#upload-evidence-cancel-btn');

        await expect(authedPage.locator('#upload-form')).toBeHidden({ timeout: 5000 });
        await expect(authedPage.locator('#evidence-table')).toBeVisible();
    });
});

