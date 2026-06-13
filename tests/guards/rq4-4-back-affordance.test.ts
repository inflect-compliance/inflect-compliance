/**
 * RQ4-4 — BackAffordance primitive ratchet.
 *
 * Locks the structural shape of the smart-back system:
 *
 *   - `<BackAffordance>` resolves in two tiers (referrer → canonical
 *     parent) — both branches exist in the source.
 *   - `EntityDetailLayout.back` accepts the `{ smart: true }` form and
 *     routes through `<BackAffordance>`.
 *   - The legacy `{ href, label }` static-link form continues to work
 *     (CoverageClient is the surviving caller).
 *   - Every entry in `SUBPAGES` has a canonical parent.
 *   - No entry in `MAIN_PAGES` has a canonical parent (negative — OB-H).
 */
import * as fs from 'fs';
import * as path from 'path';
import {
    MAIN_PAGES,
    SUBPAGES,
} from '@/lib/nav/page-segregation';
import {
    CANONICAL_PARENT_MAP_INTERNAL,
    resolveCanonicalParent,
} from '@/lib/nav/canonical-parents';

const BACK_AFFORDANCE_PATH = path.resolve(
    __dirname,
    '../../src/components/nav/BackAffordance.tsx',
);
const ENTITY_DETAIL_LAYOUT_PATH = path.resolve(
    __dirname,
    '../../src/components/layout/EntityDetailLayout.tsx',
);

describe('rq4-4 back affordance', () => {
    it('every SUBPAGE has a canonical parent', () => {
        const missing = SUBPAGES.filter(
            (p) => !CANONICAL_PARENT_MAP_INTERNAL[p],
        );
        expect(missing).toEqual([]);
    });

    it('no MAIN_PAGE has a canonical parent (OB-H negative guard)', () => {
        const leaked = MAIN_PAGES.filter(
            (p) => CANONICAL_PARENT_MAP_INTERNAL[p],
        );
        expect(leaked).toEqual([]);
    });

    it('every canonical parent href points at a known route', () => {
        const known = new Set([...MAIN_PAGES, ...SUBPAGES]);
        for (const [child, parent] of Object.entries(
            CANONICAL_PARENT_MAP_INTERNAL,
        )) {
            expect({
                child,
                parentHref: parent.href,
                known: known.has(parent.href),
            }).toEqual({
                child,
                parentHref: parent.href,
                known: true,
            });
        }
    });

    it('resolveCanonicalParent expands dynamic segments shared with the child', () => {
        const parent = resolveCanonicalParent(
            '/t/acme/vendors/v123/assessment/a456',
            'acme',
        );
        expect(parent).toEqual({
            href: '/t/acme/vendors/v123',
            label: 'Vendor',
        });
    });

    it('resolveCanonicalParent returns null for main pages', () => {
        expect(resolveCanonicalParent('/t/acme/risks', 'acme')).toBeNull();
        expect(resolveCanonicalParent('/t/acme/dashboard', 'acme')).toBeNull();
    });

    it('BackAffordance is a client component', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source.startsWith("'use client';")).toBe(true);
    });

    it('BackAffordance has BOTH referrer + canonical-parent branches', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/usePreviousPath/);
        expect(source).toMatch(/resolveCanonicalParent/);
    });

    it('BackAffordance renders the ArrowLeft icon, not the unicode glyph in JSX', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/<ArrowLeft\b/);
        // Ensure the JSX text doesn't carry the unicode arrow (doc comments are fine).
        expect(source).not.toMatch(/>\s*← /);
        expect(source).not.toMatch(/\{['"]← /);
    });

    it('BackAffordance carries an aria-label naming the destination', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/aria-label=\{?`?Back to /);
    });

    it('BackAffordance hides under @media print (OB-I)', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/print:hidden/);
    });

    it('BackAffordance respects prefers-reduced-motion (OB-G)', () => {
        const source = fs.readFileSync(BACK_AFFORDANCE_PATH, 'utf-8');
        expect(source).toMatch(/motion-safe:/);
    });

    it('EntityDetailLayout.back accepts the { smart: true } form', () => {
        const source = fs.readFileSync(ENTITY_DETAIL_LAYOUT_PATH, 'utf-8');
        expect(source).toMatch(/smart:\s*true/);
        expect(source).toMatch(/<BackAffordance\b/);
    });

    it('EntityDetailLayout preserves the legacy { href, label } static form', () => {
        const source = fs.readFileSync(ENTITY_DETAIL_LAYOUT_PATH, 'utf-8');
        expect(source).toMatch(/href:\s*string/);
        expect(source).toMatch(/label:\s*string/);
    });
});
