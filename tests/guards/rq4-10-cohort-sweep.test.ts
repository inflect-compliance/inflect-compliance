/**
 * RQ4-10 — Cohort sweep ratchet.
 *
 * The capstone enforcement layer for the RQ4 wave. Two complementary
 * invariants:
 *
 *   1. **Positive coverage.** Every route in `SUBPAGES` (minus the
 *      explicit exemption list) imports `BackAffordance` from
 *      `@/components/nav/BackAffordance` AND mounts `<BackAffordance ...>`
 *      somewhere in the page tree (either directly OR via the
 *      `EntityDetailLayout.back={ smart: true }` form).
 *   2. **Negative coverage (OB-H).** No route in `MAIN_PAGES` imports
 *      or mounts `<BackAffordance>` — main pages don't carry a back
 *      affordance, by design.
 *
 * The ratchet walks the actual `page.tsx` files (and the canonical
 * client-component sibling when the page is a thin server wrapper) so
 * it can't be cheated by adding the entry to the segregation list
 * without actually wiring the affordance.
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    BACK_AFFORDANCE_EXEMPT_SUBPAGES,
    MAIN_PAGES,
    SUBPAGES,
} from '@/lib/nav/page-segregation';

const APP_PAGES = path.resolve(__dirname, '../../src/app/t/[tenantSlug]/(app)');

function routePatternToFilesystemPath(pattern: string): string {
    return path.join(APP_PAGES, pattern.replace(/^\//, ''));
}

/**
 * For a given route pattern, return the set of `.tsx` files we consider
 * part of its rendered tree:
 *   - the `page.tsx`
 *   - sibling `*Client.tsx` files in the same directory (canonical
 *     thin-wrapper pattern)
 */
function tsxFilesForPattern(pattern: string): string[] {
    const dir = routePatternToFilesystemPath(pattern);
    if (!fs.existsSync(dir)) return [];
    const pageFile = path.join(dir, 'page.tsx');
    if (!fs.existsSync(pageFile)) return [];

    const siblings = fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(
            (e) =>
                e.isFile() &&
                e.name.endsWith('.tsx') &&
                e.name !== 'loading.tsx' &&
                e.name !== 'error.tsx',
        )
        .map((e) => path.join(dir, e.name));

    return [pageFile, ...siblings.filter((f) => f !== pageFile)];
}

function fileMountsBackAffordance(file: string): boolean {
    const source = fs.readFileSync(file, 'utf-8');
    if (!/@\/components\/nav\/BackAffordance/.test(source)) {
        // EntityDetailLayout's `{ smart: true }` form counts as a mount
        // because the layout itself renders <BackAffordance/>.
        return /\bback=\{\{\s*smart:\s*true\s*\}\}/.test(source);
    }
    return /<BackAffordance\b/.test(source);
}

function fileMentionsBackAffordance(file: string): boolean {
    const source = fs.readFileSync(file, 'utf-8');
    return (
        /@\/components\/nav\/BackAffordance/.test(source) ||
        /<BackAffordance\b/.test(source) ||
        /\bback=\{\{\s*smart:\s*true\s*\}\}/.test(source)
    );
}

describe('rq4-10 cohort sweep', () => {
    it('every SUBPAGE (minus exemptions) mounts BackAffordance', () => {
        const exempt = new Set(BACK_AFFORDANCE_EXEMPT_SUBPAGES);
        const missing: string[] = [];

        for (const pattern of SUBPAGES) {
            if (exempt.has(pattern)) continue;
            const files = tsxFilesForPattern(pattern);
            if (files.length === 0) {
                missing.push(`${pattern} — no page.tsx on disk`);
                continue;
            }
            const mounted = files.some(fileMountsBackAffordance);
            if (!mounted) {
                missing.push(pattern);
            }
        }

        expect(missing).toEqual([]);
    });

    it('no MAIN_PAGE imports or mounts BackAffordance (OB-H)', () => {
        const leaked: string[] = [];

        for (const pattern of MAIN_PAGES) {
            const files = tsxFilesForPattern(pattern);
            for (const f of files) {
                if (fileMentionsBackAffordance(f)) {
                    leaked.push(`${pattern} (${path.basename(f)})`);
                }
            }
        }

        expect(leaked).toEqual([]);
    });

    it('every exempt subpage is still listed in SUBPAGES (no orphan exemptions)', () => {
        const subSet = new Set(SUBPAGES);
        const orphans = BACK_AFFORDANCE_EXEMPT_SUBPAGES.filter(
            (p) => !subSet.has(p),
        );
        expect(orphans).toEqual([]);
    });
});
