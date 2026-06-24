/**
 * Epic 46 — `buildFrameworkTree` unit tests.
 *
 * The builder is the pure heart of the framework viewer — its job
 * is to take a flat `FrameworkRequirement[]` and produce a nested
 * `FrameworkTreePayload` with at least three logical levels
 * (section → requirement → sub-requirement) supported.
 *
 * The seeded data uses three different hierarchy encodings (theme,
 * section, code-prefix) so the builder must handle all three
 * gracefully. We also assert performance assumptions for large
 * trees here — those numbers are sensitive and any regression
 * deserves a CI failure rather than a slow page in production.
 */

import {
    buildFrameworkTree,
    type BuildableFramework,
    type BuildableRequirement,
} from '@/lib/framework-tree/build';

const FW: BuildableFramework = {
    id: 'fw-1',
    key: 'TEST',
    name: 'Test Framework',
    version: '2024',
    kind: 'ISO_STANDARD',
    description: null,
};

function req(
    code: string,
    extras: Partial<BuildableRequirement> = {},
): BuildableRequirement {
    return {
        id: `req-${code}`,
        code,
        title: `Requirement ${code}`,
        description: null,
        section: null,
        category: null,
        theme: null,
        themeNumber: null,
        sortOrder: 0,
        ...extras,
    };
}

describe('buildFrameworkTree', () => {
    // ─── ISO 27001 — theme grouping ─────────────────────────────
    it('groups by theme when theme + themeNumber are set (ISO 27001 shape)', () => {
        const tree = buildFrameworkTree(FW, [
            req('5.1', { theme: 'ORGANIZATIONAL', themeNumber: 5, sortOrder: 1 }),
            req('5.2', { theme: 'ORGANIZATIONAL', themeNumber: 5, sortOrder: 2 }),
            req('6.1', { theme: 'PEOPLE', themeNumber: 6, sortOrder: 50 }),
            req('7.1', { theme: 'PHYSICAL', themeNumber: 7, sortOrder: 100 }),
        ]);
        expect(tree.nodes).toHaveLength(3);
        expect(tree.nodes.map((n) => n.label)).toEqual([
            'ORGANIZATIONAL',
            'PEOPLE',
            'PHYSICAL',
        ]);
        expect(tree.nodes[0].kind).toBe('section');
        expect(tree.nodes[0].children).toHaveLength(2);
        expect(tree.nodes[0].children[0].code).toBe('5.1');
    });

    it('orders themes by themeNumber, not alphabetically', () => {
        // PHYSICAL (7) comes after ORGANIZATIONAL (5) numerically, even
        // though PHYSICAL < ORGANIZATIONAL alphabetically.
        const tree = buildFrameworkTree(FW, [
            req('7.1', { theme: 'PHYSICAL', themeNumber: 7 }),
            req('5.1', { theme: 'ORGANIZATIONAL', themeNumber: 5 }),
        ]);
        expect(tree.nodes.map((n) => n.label)).toEqual([
            'ORGANIZATIONAL',
            'PHYSICAL',
        ]);
    });

    // ─── NIS 2 — section grouping ───────────────────────────────
    it('groups by section when present (NIS 2 shape)', () => {
        const tree = buildFrameworkTree(FW, [
            req('Art.21(2)(a)', { section: 'Article 21 - Risk-management', sortOrder: 1 }),
            req('Art.21(2)(b)', { section: 'Article 21 - Risk-management', sortOrder: 2 }),
            req('Art.23(1)', { section: 'Article 23 - Reporting', sortOrder: 50 }),
        ]);
        expect(tree.nodes).toHaveLength(2);
        expect(tree.nodes[0].label).toBe('Article 21 - Risk-management');
        expect(tree.nodes[0].children).toHaveLength(2);
    });

    // ─── SOC 2 — code-prefix fallback ───────────────────────────
    it('falls back to code-prefix grouping when no metadata is present (SOC 2 shape)', () => {
        const tree = buildFrameworkTree(FW, [
            req('CC1.1'),
            req('CC1.2'),
            req('CC2.1'),
            req('CC2.2'),
        ]);
        expect(tree.nodes).toHaveLength(2);
        expect(tree.nodes.map((n) => n.label).sort()).toEqual(['CC1', 'CC2']);
    });

    // ─── Dotted code nesting (3+ levels) ────────────────────────
    it('nests requirements when one code is a dotted prefix of another', () => {
        const tree = buildFrameworkTree(FW, [
            req('5.1', { theme: 'ORG', themeNumber: 5 }),
            req('5.1.1', { theme: 'ORG', themeNumber: 5 }),
            req('5.1.2', { theme: 'ORG', themeNumber: 5 }),
            req('5.1.2.3', { theme: 'ORG', themeNumber: 5 }),
        ]);
        expect(tree.totals.maxDepth).toBe(4); // section → 5.1 → 5.1.2 → 5.1.2.3
        const section = tree.nodes[0];
        expect(section.children).toHaveLength(1); // only 5.1 at top
        const fivePtOne = section.children[0];
        expect(fivePtOne.code).toBe('5.1');
        expect(fivePtOne.children.map((c) => c.code)).toEqual(['5.1.1', '5.1.2']);
        const fivePtOnePtTwo = fivePtOne.children[1];
        expect(fivePtOnePtTwo.children.map((c) => c.code)).toEqual(['5.1.2.3']);
    });

    it('does NOT confuse lexical prefix for dotted prefix (5.1 vs 5.10)', () => {
        // 5.10 looks like a string-prefix child of 5.1 but is NOT
        // a dotted descendant — bug from the prior flat renderer
        // and the most common reason a naive code-prefix tree
        // produces nonsense.
        const tree = buildFrameworkTree(FW, [
            req('5.1', { theme: 'ORG', themeNumber: 5, sortOrder: 1 }),
            req('5.10', { theme: 'ORG', themeNumber: 5, sortOrder: 10 }),
        ]);
        const section = tree.nodes[0];
        expect(section.children).toHaveLength(2);
        expect(section.children.map((c) => c.code)).toEqual(['5.1', '5.10']);
    });

    // ─── Aggregates ─────────────────────────────────────────────
    it('reports descendantCount including deep nesting', () => {
        const tree = buildFrameworkTree(FW, [
            req('A', { theme: 'X', themeNumber: 1 }),
            req('A.1', { theme: 'X', themeNumber: 1 }),
            req('A.1.1', { theme: 'X', themeNumber: 1 }),
            req('A.1.1.1', { theme: 'X', themeNumber: 1 }),
        ]);
        const section = tree.nodes[0];
        expect(section.descendantCount).toBe(4); // A + A.1 + A.1.1 + A.1.1.1
        const a = section.children[0];
        expect(a.code).toBe('A');
        expect(a.descendantCount).toBe(3);
        expect(a.childCount).toBe(1);
    });

    it('returns empty nodes array for an empty requirement list', () => {
        const tree = buildFrameworkTree(FW, []);
        expect(tree.nodes).toEqual([]);
        expect(tree.totals.sections).toBe(0);
        expect(tree.totals.requirements).toBe(0);
        expect(tree.totals.maxDepth).toBe(0);
    });

    // ─── Determinism ────────────────────────────────────────────
    it('is deterministic across two builds with identical input', () => {
        const requirements: BuildableRequirement[] = [
            req('A.1', { theme: 'T', themeNumber: 1 }),
            req('A.2', { theme: 'T', themeNumber: 1 }),
            req('B.1', { theme: 'U', themeNumber: 2 }),
        ];
        const a = buildFrameworkTree(FW, requirements);
        const b = buildFrameworkTree(FW, requirements);
        expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    });

    // ─── Stability under input shuffle ──────────────────────────
    it('produces the same shape when input order is shuffled', () => {
        const reqs = [
            req('5.1.1', { theme: 'ORG', themeNumber: 5, sortOrder: 2 }),
            req('5.1', { theme: 'ORG', themeNumber: 5, sortOrder: 1 }),
            req('5.2', { theme: 'ORG', themeNumber: 5, sortOrder: 3 }),
        ];
        const a = buildFrameworkTree(FW, reqs);
        const b = buildFrameworkTree(FW, [reqs[2], reqs[0], reqs[1]]);
        // Compare the structural shape only (ignore object identity).
        const summarise = (t: typeof a) =>
            t.nodes.map((s) => ({
                label: s.label,
                children: s.children.map((r) => ({
                    code: r.code,
                    children: r.children.map((c) => c.code),
                })),
            }));
        expect(summarise(a)).toEqual(summarise(b));
    });

    // ─── Performance guardrails ─────────────────────────────────
    describe('large trees', () => {
        function genFlat(n: number): BuildableRequirement[] {
            const out: BuildableRequirement[] = [];
            for (let i = 0; i < n; i++) {
                const theme = `T${(i % 8) + 1}`;
                out.push(
                    req(`${(i % 8) + 1}.${Math.floor(i / 8) + 1}`, {
                        theme,
                        themeNumber: (i % 8) + 1,
                        sortOrder: i,
                    }),
                );
            }
            return out;
        }

        it('builds large trees correctly at scale', () => {
            // Correctness at scale — deterministic, no timing.
            const small = buildFrameworkTree(FW, genFlat(500));
            const large = buildFrameworkTree(FW, genFlat(2000));
            expect(small.totals.requirements).toBe(500);
            expect(small.nodes.length).toBeGreaterThan(0);
            expect(large.totals.requirements).toBe(2000);
            expect(large.nodes.length).toBeGreaterThan(0);
        });

        it('builds in roughly linear time (no O(n^2) blow-up)', () => {
            // Scaling guard, NOT an absolute wall-clock budget. The old
            // `elapsed < 500ms` form flaked on loaded CI runners (a 25x
            // scheduler slowdown blew the fixed ceiling even though the
            // algorithm was unchanged). Measuring a RATIO across two
            // input sizes is immune to absolute machine speed: load
            // slows both builds proportionally, so the assertion stays
            // stable, while an accidental O(n^2) regression — which
            // costs ~16x for a 4x input rather than the ~linear ~4x —
            // still trips it. Warm up first so JIT/allocation overhead
            // doesn't skew the smaller (baseline) measurement.
            const small = genFlat(500);
            const large = genFlat(2000); // 4x the input
            buildFrameworkTree(FW, small); // warm-up

            const t0 = Date.now();
            buildFrameworkTree(FW, small);
            const smallMs = Date.now() - t0;

            const t1 = Date.now();
            buildFrameworkTree(FW, large);
            const largeMs = Date.now() - t1;

            // 4x the input should cost well under 10x the time. The
            // additive term absorbs sub-millisecond timer resolution at
            // tiny durations so the ratio never divides by ~0.
            expect(largeMs).toBeLessThanOrEqual(smallMs * 10 + 50);
        });
    });
});
