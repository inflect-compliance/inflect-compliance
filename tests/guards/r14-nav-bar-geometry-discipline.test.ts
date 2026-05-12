/**
 * Roadmap-14 PR-2 — `<NavBar>` geometry discipline.
 *
 * The top-bar's structural feel comes from five geometry choices,
 * each one a decision that the eye reads even when it can't name
 * them. R14-PR2 lifts them out of inline class strings (PR-1
 * declared the shell as one long literal) into named tokens with
 * doc-comments next to each value. A future "just bump height by
 * 4px" PR has to argue against both the doc-comment AND this
 * ratchet.
 *
 * Five tokens, each one a single load-bearing knob:
 *
 *   `NAV_BAR_HEIGHT`    `h-16` (64px) — desktop bar height
 *   `NAV_BAR_PADDING`   `px-4 md:px-6` — horizontal padding scale
 *   `NAV_BAR_GAP`       `gap-default` — 8px between slots
 *   `NAV_BAR_POSITION`  `sticky top-0 z-30` — pinned to top
 *   `NAV_BAR_SURFACE`   border + bg/80 + backdrop-blur — glass
 *
 * The composition `NAV_BAR_SHELL` references each token; if a
 * future PR replaces a token reference with an inline literal,
 * the geometry layer drifts back into the shell file and the next
 * "bump by 4px" PR can land silently.
 *
 * Mirror of R12-PR2 (`nav-item-geometry-discipline.test.ts`) —
 * same pattern, applied to the top-bar primitive.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NAV_BAR_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/nav-bar.tsx'),
    'utf8',
);

describe('Roadmap-14 PR-2 — NavBar geometry discipline', () => {
    describe('named geometry tokens', () => {
        it('exports NAV_BAR_HEIGHT = `h-16`', () => {
            // 64px = 56px (R2-era h-14) + 8px breath. Fits brand
            // mark (32px) + search anchor (28px) + user avatar
            // (32px) + bell (28px) with vertical halos.
            expect(NAV_BAR_SRC).toMatch(
                /export\s+const\s+NAV_BAR_HEIGHT\s*=\s*['"]h-16['"]/,
            );
        });

        it('exports NAV_BAR_PADDING = `px-4 md:px-6`', () => {
            // 16px mobile / 24px desktop. Desktop padding matches
            // the page-content `md:p-6` so the chrome's edges
            // align with content below.
            expect(NAV_BAR_SRC).toMatch(
                /export\s+const\s+NAV_BAR_PADDING\s*=\s*['"]px-4\s+md:px-6['"]/,
            );
        });

        it('exports NAV_BAR_GAP = `gap-default`', () => {
            // 8px via semantic spacing scale. Same gap vocabulary
            // every premium primitive uses; mixing 6/8/12 gaps
            // across primary chrome reads as un-decided.
            expect(NAV_BAR_SRC).toMatch(
                /export\s+const\s+NAV_BAR_GAP\s*=\s*['"]gap-default['"]/,
            );
        });

        it('exports NAV_BAR_POSITION = `sticky top-0 z-30`', () => {
            // Sticky (not fixed) so content reflows when the bar
            // would otherwise overlap. z-30 above row-sticky
            // headers (z-20), below modal overlays (z-50).
            expect(NAV_BAR_SRC).toMatch(
                /export\s+const\s+NAV_BAR_POSITION\s*=\s*['"]sticky\s+top-0\s+z-30['"]/,
            );
        });

        it('exports NAV_BAR_SURFACE with the glass-blur recipe', () => {
            // Glass surface — bg-bg-page/80 backdrop-blur-sm is the
            // load-bearing piece (frosted look that doesn't stutter
            // under scrolling content). R14-PR2 originally bundled
            // `border-b border-border-subtle` here; R14-PR10 retired
            // the flat border in favour of a `::before` fading
            // gradient hairline (NAV_BAR_BOTTOM_HAIRLINE) — see the
            // doc-comment on the const for the evolution rationale.
            //
            // The glass-blur recipe is the load-bearing part this
            // assertion locks; the border evolution lives elsewhere
            // in the R14-PR10 ratchet.
            expect(NAV_BAR_SRC).toMatch(
                /export\s+const\s+NAV_BAR_SURFACE\s*=\s*[\s\S]*?bg-bg-page\/80[\s\S]*?backdrop-blur-sm/,
            );
        });
    });

    describe('NAV_BAR_SHELL composes via token references (not inline literals)', () => {
        const shellRegion =
            NAV_BAR_SRC.match(
                /export\s+const\s+NAV_BAR_SHELL\s*=\s*\[[\s\S]+?\]\.join\(/,
            )?.[0] ?? '';

        it('NAV_BAR_SHELL is an array composition (joined)', () => {
            // The shell MUST be an array `.join(' ')` of token
            // references — that's what makes it greppable per
            // token. A regression to a single string literal
            // (PR-1's form) re-couples the values to the shell
            // and the geometry-discipline ratchet loses its
            // anchors.
            expect(shellRegion).not.toBe('');
            expect(shellRegion).toMatch(/\[\s*$|\[\s*\n/);
        });

        it('references NAV_BAR_HEIGHT (not inline `h-16` literal)', () => {
            expect(shellRegion).toContain('NAV_BAR_HEIGHT');
        });
        it('references NAV_BAR_PADDING (not inline `px-4 md:px-6` literal)', () => {
            expect(shellRegion).toContain('NAV_BAR_PADDING');
        });
        it('references NAV_BAR_GAP (not inline `gap-default` literal)', () => {
            expect(shellRegion).toContain('NAV_BAR_GAP');
        });
        it('references NAV_BAR_POSITION (not inline `sticky top-0 z-30` literal)', () => {
            expect(shellRegion).toContain('NAV_BAR_POSITION');
        });
        it('references NAV_BAR_SURFACE (not inline border + bg literals)', () => {
            expect(shellRegion).toContain('NAV_BAR_SURFACE');
        });
    });

    describe('doc-comment rationale (so the "why" lives with the value)', () => {
        // The doc-comments are part of the contract — a future
        // PR that bumps a value also bumps the rationale (or
        // argues against it). The ratchet asserts each token
        // CARRIES a doc-comment block above it; the comment's
        // exact words are not locked, but its presence is.
        const tokens = [
            'NAV_BAR_HEIGHT',
            'NAV_BAR_PADDING',
            'NAV_BAR_GAP',
            'NAV_BAR_POSITION',
            'NAV_BAR_SURFACE',
        ];
        for (const token of tokens) {
            it(`${token} has a doc-comment above its declaration`, () => {
                const re = new RegExp(
                    `\\*\\/\\s*\\nexport\\s+const\\s+${token}\\b`,
                );
                expect(NAV_BAR_SRC).toMatch(re);
            });
        }
    });
});
