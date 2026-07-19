/**
 * Double-click-to-open depends on STABLE table-model identities.
 *
 * ─── The failure mode ───────────────────────────────────────────────
 *
 * DataTable's click model (R13-PR14): a single click toggles row
 * selection, a double-click navigates. So a real double-click fires
 * `onClick` twice (select → deselect) and `onDoubleClick` once — which
 * means the row RE-RENDERS between the two clicks.
 *
 * If the page hands DataTable a fresh `columns` / `onRowClick` /
 * `getRowId` identity on that re-render, the table model is rebuilt
 * mid-double-click, the row's DOM node is replaced, and the browser
 * never fires `dblclick` at all — because the two clicks no longer
 * share a live common ancestor. Navigation silently dies.
 *
 * The sharpest version of this is indirect: a page whose column `useMemo`
 * lists an UNSTABLE value in its dep array (e.g. a `tenantHref` defined
 * as a bare arrow instead of a `useCallback`) rebuilds its columns on
 * every render, not just on selection changes.
 *
 * That is exactly how `PoliciesClient` regressed — `tenantHref` was a
 * plain arrow, it sat in `policyColumns`' dep array, so the memo never
 * held. `tests/e2e/data-table-platform.spec.ts` ("Policies row
 * double-click navigates to detail") was red on main for it.
 *
 * ─── Why a guard ────────────────────────────────────────────────────
 *
 * Nothing below the E2E layer catches this: tsc is happy, the component
 * renders fine, and unit/rendered tests don't perform a real two-click
 * gesture against a live table model. The E2E is a slow, expensive net.
 * This is the cheap one.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

/**
 * List clients whose rows navigate on double-click AND which are covered
 * by the data-table E2E. Adding a page here is cheap; the point is that
 * the two the E2E asserts can never silently regress again.
 */
const DBLCLICK_LIST_CLIENTS = [
    'src/app/t/[tenantSlug]/(app)/policies/PoliciesClient.tsx',
    'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
] as const;

describe('DataTable double-click — stable row identities', () => {
    for (const rel of DBLCLICK_LIST_CLIENTS) {
        describe(path.basename(rel), () => {
            const src = read(rel);

            it('does not pass an inline arrow as onRowClick', () => {
                // `onRowClick: (row) => …` mints a new function per render.
                expect(src).not.toMatch(/onRowClick:\s*\(/);
            });

            it('does not pass an inline arrow as getRowId', () => {
                expect(src).not.toMatch(/getRowId:\s*\(/);
            });

            it('defines tenantHref as a stable callback, not a bare arrow', () => {
                // The regression: `const tenantHref = (path: string) => …`
                // is recreated every render, and it sits in the column
                // memo's dep array — so the memo never holds.
                expect(src).not.toMatch(
                    /const\s+tenantHref\s*=\s*\((?!\s*\)\s*=>\s*useCallback)/,
                );
                expect(src).toMatch(
                    /const\s+tenantHref\s*=\s*(useCallback\(|useTenantHref\(\))/,
                );
            });

            it('memoises anything it lists as a column-memo dependency', () => {
                // Every identifier in the columns `useMemo` dep array must
                // itself be stable. We can't prove that statically in
                // general, but we CAN require that the dep array contains
                // no bare arrow-defined local — which is the shape that bit
                // us. Assert each dep resolves to a const declared with
                // useMemo / useCallback / a hook call, or is a primitive
                // like a state value.
                const depMatch = src.match(
                    /\]\)\s*,\s*\[([^\]]*)\]\)\s*;/,
                );
                // Not every page shapes its memo identically; when we can't
                // find the dep array, the assertions above still hold.
                if (!depMatch) return;
                const deps = depMatch[1]
                    .split(',')
                    .map((d) => d.trim())
                    .filter(Boolean);
                for (const dep of deps) {
                    const bareArrow = new RegExp(
                        `const\\s+${dep.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\s*=\\s*\\([^)]*\\)\\s*=>`,
                    );
                    expect(src).not.toMatch(bareArrow);
                }
            });
        });
    }

    it('the E2E that catches this at runtime still exists', () => {
        // If someone deletes the spec, this guard is the only remaining
        // protection — and it should not be silently load-bearing.
        const spec = read('tests/e2e/data-table-platform.spec.ts');
        expect(spec).toMatch(/Policies row double-click navigates to detail/);
        expect(spec).toMatch(/Controls row double-click navigates to detail/);
    });
});
