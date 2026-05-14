/**
 * R18-PR8 — bubbly bars.
 *
 * Three changes to the Epic-59 `<Bars>` primitive:
 *
 *   1. SETTLE-BOUNCE — each date-column springs up from the
 *      x-axis baseline (`scaleY` 0 → overshoot → 1), staggered
 *      left-to-right by column index.
 *   2. GLOSS — a shared `<ChartGloss>` def; every bar paints a
 *      second `<BarRounded>` overlay with the gloss fill.
 *   3. ROUNDER TOPS — the default corner radius bumps 2 → 3.
 *
 * Six load-bearing invariants:
 *
 *   1. The default `radius` is `3` (was `2`).
 *
 *   2. A shared `<ChartGloss>` def is rendered inside a `<defs>`
 *      — one sheen for the whole cluster.
 *
 *   3. Each bar renders TWO `<BarRounded>`s: the colour layer +
 *      a gloss-filled overlay (`url(#<glossId>)`).
 *
 *   4. The gloss overlay BarRounded is inert — `aria-hidden` +
 *      `pointerEvents="none"`.
 *
 *   5. The per-column `<motion.g>` springs `scaleY` 0 → 1 — a
 *      `type: "spring"` transition, NOT a duration/ease. The
 *      overshoot is the "bubble."
 *
 *   6. The scaleY spring pivots at the column BOTTOM —
 *      `transformOrigin` y is `${height}px` (the x-axis
 *      baseline), so a stacked column grows as one unit instead
 *      of each segment scaling from its own centre.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/bars.tsx'),
    'utf8',
);

describe('R18-PR8 — bubbly bars', () => {
    it('default radius bumped 2 → 3 (rounder tops)', () => {
        expect(SRC).toMatch(/radius\s*=\s*3\b/);
        expect(SRC).not.toMatch(/radius\s*=\s*2\b/);
    });

    it('renders a shared <ChartGloss> def inside <defs>', () => {
        expect(SRC).toMatch(
            /<defs>\s*<ChartGloss\s+id=\{chartGlossId\(chartId\)\}/,
        );
        // Exactly one JSX element — shared across the cluster, not
        // per-bar. Match the element-with-`id`-prop form so the
        // docstring's prose mention of `<ChartGloss>` doesn't count.
        const matches = SRC.match(/<ChartGloss\s+id=/g);
        expect(matches!.length).toBe(1);
    });

    it('each bar renders a colour BarRounded + a gloss-filled overlay', () => {
        // Two <BarRounded> JSX elements per bar: the colour layer
        // + the gloss. Match the element-with-`x=`-prop form so
        // the docstring's prose mention doesn't count.
        const barCount = (SRC.match(/<BarRounded\s+x=/g) ?? []).length;
        expect(barCount).toBe(2);
        expect(SRC).toMatch(
            /<BarRounded[\s\S]*?fill=\{`url\(#\$\{chartGlossId\(chartId\)\}\)`\}/,
        );
    });

    it('the gloss overlay BarRounded is inert (aria-hidden + pointerEvents none)', () => {
        expect(SRC).toMatch(
            /fill=\{`url\(#\$\{chartGlossId\(chartId\)\}\)`\}[\s\S]*?aria-hidden="true"[\s\S]*?pointerEvents="none"/,
        );
    });

    it('per-column motion.g springs scaleY 0 → 1 with a stagger delay', () => {
        expect(SRC).toMatch(/initial=\{\{\s*scaleY:\s*0\s*\}\}/);
        expect(SRC).toMatch(/animate=\{\{\s*scaleY:\s*1\s*\}\}/);
        expect(SRC).toMatch(
            /scaleY:\s*\{\s*type:\s*["']spring["'][\s\S]*?delay:\s*\(columnIndex\s*\*\s*BAR_STAGGER_MS\)/,
        );
    });

    it('the scaleY spring pivots at the column bottom (the x-axis baseline)', () => {
        // transformOrigin y = `${height}px` — the baseline. A
        // stacked column grows as one unit; pivoting at the
        // centre would make it grow from the middle outward.
        expect(SRC).toMatch(
            /transformOrigin:\s*`\$\{x\s*\+\s*barWidth\s*\/\s*2\}px\s+\$\{height\}px`/,
        );
    });
});
