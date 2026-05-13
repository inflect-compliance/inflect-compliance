/**
 * Roadmap-16 PR-1 — Lickable Chart token foundation.
 *
 * Every later R16 PR (gradient primitives, ChartFrame, hover-pop +
 * gradient-flow hooks, donut / line / radar / gantt rebuilds) reads
 * from the chart tokens locked here. The tokens form the chart
 * design system — same shape on both themes, theme-aware values.
 *
 * Six load-bearing invariants:
 *
 *   1. SIX series, each with `start` + `end` stops, declared in
 *      both `:root` (METRO) and `[data-theme="light"]` (PwC).
 *      Six is the locked palette size (user-confirmed); ratchet
 *      ensures a future PR doesn't quietly add a 7th without a
 *      conscious vocabulary change.
 *
 *   2. Each stop is a literal HEX value (not a `var()` reference),
 *      so the gradient defs in `<ChartGradient>` (R16-PR2) can
 *      resolve through plain CSS without a JS resolver.
 *
 *   3. Empty / disabled / projected fill via `--chart-series-muted`.
 *      Declared on both themes so a chart consumer can paint
 *      "data pending" rows / segments without picking a theme-
 *      specific value.
 *
 *   4. Motion tokens declared on BOTH themes with identical
 *      values — chart motion is theme-independent. Tempo + pop
 *      distance read the same on METRO and PwC; theme drift
 *      would make the chart family feel uncoordinated.
 *
 *   5. The five motion tokens — pop distance, lift, hover
 *      duration, flow duration, mount duration — match the user-
 *      confirmed "subtle pop" intensity (4px donut / 2px bar/line).
 *
 *   6. Tokens live inside the THEME BLOCKS (`:root` and
 *      `[data-theme="light"]`), not as global side-effects. A
 *      future contributor adding them as bare CSS variables
 *      outside the theme blocks would break theme-switching for
 *      chart colours.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const TOKENS_SRC = fs.readFileSync(
    path.join(ROOT, 'src/styles/tokens.css'),
    'utf8',
);

const DARK_BLOCK = TOKENS_SRC.match(/:root\s*\{[\s\S]*?\n\}/)![0];
const LIGHT_BLOCK = TOKENS_SRC.match(
    /\[data-theme="light"\]\s*\{[\s\S]*?\n\}/,
)![0];

/** Series indices the palette must cover. Locked at SIX. */
const SERIES_INDICES = [1, 2, 3, 4, 5, 6] as const;

describe('Roadmap-16 PR-1 — chart token foundation', () => {
    describe('six-series palette is declared on both themes', () => {
        for (const i of SERIES_INDICES) {
            it(`METRO declares --chart-series-${i}-start / -end as HEX literals`, () => {
                expect(DARK_BLOCK).toMatch(
                    new RegExp(`--chart-series-${i}-start:\\s*#[0-9A-Fa-f]{6}`),
                );
                expect(DARK_BLOCK).toMatch(
                    new RegExp(`--chart-series-${i}-end:\\s*#[0-9A-Fa-f]{6}`),
                );
            });

            it(`PwC declares --chart-series-${i}-start / -end as HEX literals`, () => {
                expect(LIGHT_BLOCK).toMatch(
                    new RegExp(`--chart-series-${i}-start:\\s*#[0-9A-Fa-f]{6}`),
                );
                expect(LIGHT_BLOCK).toMatch(
                    new RegExp(`--chart-series-${i}-end:\\s*#[0-9A-Fa-f]{6}`),
                );
            });
        }

        it('does NOT declare a 7th series (palette size locked at 6)', () => {
            // Adding `--chart-series-7-*` without a conscious
            // vocabulary change would dilute the palette discipline.
            // The 6-series count is locked by user decision.
            expect(DARK_BLOCK).not.toMatch(/--chart-series-7-/);
            expect(LIGHT_BLOCK).not.toMatch(/--chart-series-7-/);
        });
    });

    describe('series stops are HEX literals (not var()-references)', () => {
        // The R16-PR2 `<ChartGradient>` primitive resolves stops at
        // render time via plain CSS `<stop stop-color="var(--chart-
        // series-N-start)">`. If a stop were `var(--brand-default)`
        // instead of a literal HEX, the gradient resolution would
        // require a JS-side colour resolver — which is exactly what
        // R13's DonutChart simplification (Elevation PR-7) RETIRED.
        // Keep stops as literal HEX.
        for (const block of [DARK_BLOCK, LIGHT_BLOCK]) {
            for (const i of SERIES_INDICES) {
                const startMatch = block.match(
                    new RegExp(`--chart-series-${i}-start:\\s*([^;]+);`),
                );
                expect(startMatch).not.toBeNull();
                expect(startMatch![1].trim()).toMatch(/^#[0-9A-Fa-f]{6}$/);
                const endMatch = block.match(
                    new RegExp(`--chart-series-${i}-end:\\s*([^;]+);`),
                );
                expect(endMatch).not.toBeNull();
                expect(endMatch![1].trim()).toMatch(/^#[0-9A-Fa-f]{6}$/);
            }
        }
    });

    describe('muted / disabled fill', () => {
        it('METRO declares --chart-series-muted', () => {
            expect(DARK_BLOCK).toMatch(/--chart-series-muted:\s*rgba\(/);
        });

        it('PwC declares --chart-series-muted', () => {
            expect(LIGHT_BLOCK).toMatch(/--chart-series-muted:\s*rgba\(/);
        });
    });

    describe('motion tokens on both themes', () => {
        const MOTION_TOKENS = [
            { name: '--chart-hover-pop-distance', value: '4px' },
            { name: '--chart-hover-lift', value: '2px' },
            { name: '--chart-hover-duration', value: '200ms' },
            { name: '--chart-flow-duration', value: '1.4s' },
            { name: '--chart-mount-duration', value: '600ms' },
        ];

        for (const { name, value } of MOTION_TOKENS) {
            it(`METRO declares ${name}: ${value}`, () => {
                expect(DARK_BLOCK).toContain(`${name}: ${value};`);
            });

            it(`PwC declares ${name}: ${value} (identical to METRO)`, () => {
                // Chart motion is theme-independent. Same tempo +
                // distance on both themes so the chart-language
                // reads identically across themes. Theme drift on
                // motion would make the chart family feel
                // uncoordinated.
                expect(LIGHT_BLOCK).toContain(`${name}: ${value};`);
            });
        }
    });

    describe('palette neighbourhood pairing (adjacent-tonal)', () => {
        // The user's "where two colours meet" effect (R16-PR2+)
        // depends on adjacent series having end/start stops in a
        // perceptually neighbouring tone. We don't lock the exact
        // hex values — future tuning is expected — but we DO lock
        // the structural commitment that the palette ships with
        // a 2-stop-per-series shape, NOT a single-colour-per-series
        // shape. A regression from 2-stops to 1-stop would lose
        // the gradient-blend mechanism entirely.
        for (const block of [DARK_BLOCK, LIGHT_BLOCK]) {
            for (const i of SERIES_INDICES) {
                const startMatch = block.match(
                    new RegExp(`--chart-series-${i}-start:\\s*([^;]+);`),
                );
                const endMatch = block.match(
                    new RegExp(`--chart-series-${i}-end:\\s*([^;]+);`),
                );
                expect(startMatch).not.toBeNull();
                expect(endMatch).not.toBeNull();
                // start and end must be DIFFERENT colours — a
                // single-colour gradient is a no-op. Locks the
                // "every series is a gradient" intent.
                expect(startMatch![1].trim()).not.toBe(
                    endMatch![1].trim(),
                );
            }
        }
    });
});
