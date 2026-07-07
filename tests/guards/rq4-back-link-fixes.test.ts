/**
 * RQ4 back-link fixes — locks the three concrete behaviour changes:
 *
 *   1. `labelFromPathname` resolves `/audits` to "Internal Audit" (the
 *      product display name), not the raw "Audits". The lookup is a
 *      static map in `BackAffordance.tsx` so the regex check is
 *      stable against future renames.
 *   2. `<BackAffordance noFallback />` is a real prop on the
 *      primitive AND its branch logic skips the canonical-parent
 *      fallback. Source-scan confirms both.
 *   3. The canonical parent for `/controls/[controlId]/tests/[planId]`
 *      points at `/tests` (label "Tests"), not the URL parent
 *      `/controls/[controlId]`. The user-mental-model parent of a
 *      test plan is the Tests list — the smart referrer still wins
 *      when drilling in from a control detail.
 */
import * as fs from 'fs';
import * as path from 'path';
import { resolveCanonicalParent } from '@/lib/nav/canonical-parents';
import {
    REFERRER_ONLY_BACK_MAIN_PAGES,
} from '@/lib/nav/page-segregation';

const BACK_AFFORDANCE_PATH = path.resolve(
    __dirname,
    '../../src/components/nav/BackAffordance.tsx',
);

describe('rq4 back-link fixes', () => {
    it('BackAffordance carries a SECTION_LABELS map mapping /audits to "Internal Audit"', () => {
        // Post-i18n: SECTION_LABELS maps `/audits` to the
        // `common.sections.audits` message KEY, and the English catalog
        // resolves that key to the product display name "Internal Audit"
        // (not the raw "Audits"). Both halves are asserted so a rename
        // still fails CI.
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/SECTION_LABELS/);
        expect(source).toMatch(/'\/audits':\s*'audits'/);
        const en = JSON.parse(
            fs.readFileSync(
                path.resolve(__dirname, '../../messages/en.json'),
                'utf-8',
            ),
        );
        expect(en.common.sections.audits).toBe('Internal Audit');
    });

    it('BackAffordance exposes a `noFallback` prop that skips canonical resolution', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/noFallback\?:\s*boolean/);
        // The implementation must gate canonical-parent resolution behind
        // noFallback (with no referrer + noFallback the component returns
        // null). The sibling-detail guard expresses this as
        // `noFallback ? null : resolveCanonicalParent(...)`.
        expect(source).toMatch(/noFallback\s*\?\s*null/);
    });

    it('BackAffordance skips a sibling-detail referrer → canonical parent (no circular back)', () => {
        // Stepping /assets/A → /assets/B via prev/next must not make "Back"
        // return to /assets/B; siblings (same canonical parent) route to the
        // shared parent (the list) instead.
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/referrerIsSibling/);
        expect(source).toMatch(/resolveCanonicalParent\(referrer, tenantSlug\)/);
    });

    it('canonical parent for /controls/[controlId]/tests/[planId] is /tests with label "Tests"', () => {
        const parent = resolveCanonicalParent(
            '/t/acme/controls/c1/tests/p1',
            'acme',
        );
        expect(parent).toEqual({
            href: '/t/acme/tests',
            label: 'Tests',
        });
    });

    it('REFERRER_ONLY_BACK_MAIN_PAGES lists /clauses and /findings (the deep-linked-from-audits set)', () => {
        expect(REFERRER_ONLY_BACK_MAIN_PAGES).toContain('/clauses');
        expect(REFERRER_ONLY_BACK_MAIN_PAGES).toContain('/findings');
    });
});
