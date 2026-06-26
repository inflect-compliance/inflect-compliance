/**
 * Bundle-size budget gate (First Load JS per route).
 *
 * Reads Next's app-build-manifest after a production build and fails if a
 * tracked route's JS payload exceeds its budget. The budgets are an
 * ALLOWLIST: a PR that legitimately grows a route past its budget updates
 * the number in the same diff (mirrors the `as any` ratchet shape).
 *
 * Where it runs: the `Bundle Analyze` workflow (.github/workflows/
 * bundle-analyze.yml) builds the app, so the manifest exists there and
 * this gate is live. In the standard jest CI job (no build) there is no
 * manifest, so the test SKIPS — it never false-fails on an unbuilt tree.
 *
 * Calibration note: the initial budgets below are starting targets, not
 * measured ceilings (this repo's build is exercised in CI, not here).
 * Tune them down to ~10% above the real First Load JS once the first
 * analyze build reports actual sizes.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

const ROOT = path.resolve(__dirname, '../..');
const MANIFEST = path.join(ROOT, '.next', 'app-build-manifest.json');

/** Per-route First Load JS budgets, gzipped KB. Allowlist — update in-diff. */
const BUDGETS_KB: Record<string, number> = {
    'dashboard': 400,
    'risks': 350,
    'controls': 350,
    // Catch-all for any other tenant page.
    'tenant-default': 250,
    // Auth / public pages.
    'root': 150,
};

/** Map an app-build-manifest page key to a budget key. */
function budgetKeyFor(pageKey: string): string {
    if (pageKey.includes('/dashboard/')) return 'dashboard';
    if (pageKey.includes('/risks/') && pageKey.endsWith('/page')) return 'risks';
    if (pageKey.includes('/controls/') && pageKey.endsWith('/page')) return 'controls';
    if (pageKey.includes('/t/[tenantSlug]')) return 'tenant-default';
    return 'root';
}

function gzippedKb(files: string[]): number {
    let total = 0;
    for (const rel of files) {
        const abs = path.join(ROOT, '.next', rel);
        if (!fs.existsSync(abs)) continue;
        try {
            total += zlib.gzipSync(fs.readFileSync(abs)).length;
        } catch {
            /* unreadable chunk — skip */
        }
    }
    return total / 1024;
}

describe('bundle-size budget', () => {
    if (!fs.existsSync(MANIFEST)) {
        it('skipped — no production build manifest (run via the Bundle Analyze workflow)', () => {
            // eslint-disable-next-line no-console
            console.log('[bundle-size-budget] .next/app-build-manifest.json absent — skipping (no build in this job).');
            expect(true).toBe(true);
        });
        return;
    }

    const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8')) as { pages: Record<string, string[]> };

    it('every tracked route is within its First Load JS budget', () => {
        const violations: string[] = [];
        for (const [pageKey, files] of Object.entries(manifest.pages)) {
            const jsFiles = files.filter((f) => f.endsWith('.js'));
            const sizeKb = gzippedKb(jsFiles);
            const budget = BUDGETS_KB[budgetKeyFor(pageKey)];
            if (sizeKb > budget) {
                violations.push(`${pageKey}: ${sizeKb.toFixed(0)}KB > ${budget}KB budget`);
            }
        }
        expect(violations).toEqual([]);
    });
});
