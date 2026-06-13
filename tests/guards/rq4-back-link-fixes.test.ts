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
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/SECTION_LABELS/);
        expect(source).toMatch(/'\/audits':\s*'Internal Audit'/);
    });

    it('BackAffordance exposes a `noFallback` prop that skips canonical resolution', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/noFallback\?:\s*boolean/);
        // The implementation must gate the canonical-parent branch
        // behind `!noFallback`. The user-visible contract: with no
        // referrer + noFallback, the component returns null.
        expect(source).toMatch(/!noFallback/);
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
