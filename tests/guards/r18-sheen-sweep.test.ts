/**
 * R18-PR10 — periodic sheen sweep.
 *
 * Where `<ChartGloss>` (PR-1) is a STATIC catch-light,
 * `<ChartSheenSweep>` is a MOVING one — a narrow white band that
 * pans slowly across a chart surface on a loop, the way light
 * travels across a polished object as you turn it.
 *
 * Ships the primitive (`<ChartSheenSweep>` + `chartSheenId`),
 * the motion hook (`useChartSheen`), and the first consumer
 * wiring (DonutChart — a third stacked layer on every segment).
 *
 * Seven load-bearing invariants:
 *
 *   1. `<ChartSheenSweep>` is a `forwardRef` `<linearGradient>` —
 *      the ref is what `useChartSheen` attaches to in order to
 *      pan the `gradientTransform`. Mirrors `<ChartFlowGradient>`.
 *
 *   2. It uses `gradientUnits="userSpaceOnUse"` + an identity
 *      `gradientTransform="translate(0,0)"` — the hook pans away
 *      from identity in user-space px.
 *
 *   3. The stops are transparent → white-band → transparent (all
 *      `#ffffff`, the band concentrated near 50%). The
 *      transparent ENDS are load-bearing: the colour + gloss
 *      layers below must show through everywhere except the
 *      travelling band.
 *
 *   4. `useChartSheen` honours `prefers-reduced-motion` via the
 *      shared `useReducedMotion` hook — the RAF loop never
 *      starts; the gradient stays at identity (no resting sheen,
 *      no motion).
 *
 *   5. `CHART_SHEEN_PERIOD_MS` is exported and SLOW (≥ 4000ms) —
 *      ambient polish, not a loading shimmer. Slower than the
 *      R16 `CHART_FLOW_PERIOD_MS` (1.4s) hover-flow.
 *
 *   6. The DonutChart renders a `<ChartSheenSweep>` def with the
 *      `sheenRef` attached, and drives it via `useChartSheen`.
 *
 *   7. Each donut segment paints a THIRD `<path>` (after colour +
 *      gloss) filled with the sheen def — the stacking order is
 *      colour → static gloss → moving sheen.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const GLOSS_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-gloss.tsx'),
    'utf8',
);
const MOTION_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-motion.tsx'),
    'utf8',
);
const DONUT_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/DonutChart.tsx'),
    'utf8',
);

describe('R18-PR10 — periodic sheen sweep', () => {
    describe('ChartSheenSweep primitive', () => {
        it('is a forwardRef <linearGradient>', () => {
            expect(GLOSS_SRC).toMatch(
                /export\s+const\s+ChartSheenSweep\s*=\s*forwardRef</,
            );
            expect(GLOSS_SRC).toMatch(/<linearGradient\s*\n?\s*ref=\{ref\}/);
        });

        it('uses userSpaceOnUse + identity gradientTransform', () => {
            expect(GLOSS_SRC).toMatch(
                /ChartSheenSweep[\s\S]*?gradientUnits="userSpaceOnUse"/,
            );
            expect(GLOSS_SRC).toMatch(
                /ChartSheenSweep[\s\S]*?gradientTransform="translate\(0,0\)"/,
            );
        });

        it('stops are transparent → white band → transparent', () => {
            // Five stops, all white, with the band concentrated
            // near 50% and the 0% / 100% ends fully transparent.
            expect(GLOSS_SRC).toMatch(
                /ChartSheenSweep[\s\S]*?offset="0%"\s+stopColor="#ffffff"\s+stopOpacity=\{0\}/,
            );
            expect(GLOSS_SRC).toMatch(
                /ChartSheenSweep[\s\S]*?offset="50%"\s+stopColor="#ffffff"\s+stopOpacity=\{0\.4\}/,
            );
            expect(GLOSS_SRC).toMatch(
                /ChartSheenSweep[\s\S]*?offset="100%"\s+stopColor="#ffffff"\s+stopOpacity=\{0\}/,
            );
        });

        it('chartSheenId mirrors chartGlossId', () => {
            expect(GLOSS_SRC).toMatch(
                /export\s+function\s+chartSheenId\(chartId:\s*string\):\s*string/,
            );
            expect(GLOSS_SRC).toMatch(/\$\{chartId\}-sheen`/);
        });
    });

    describe('useChartSheen hook', () => {
        it('honours prefers-reduced-motion (loop never starts)', () => {
            expect(MOTION_SRC).toMatch(
                /useChartSheen[\s\S]*?const\s+reduced\s*=\s*useReducedMotion\(\)/,
            );
            expect(MOTION_SRC).toMatch(
                /useChartSheen[\s\S]*?if\s*\(reduced\)\s*\{[\s\S]*?return\s+undefined/,
            );
        });

        it('exports a SLOW period constant (≥ 4000ms — ambient, not shimmer)', () => {
            const m = MOTION_SRC.match(
                /export\s+const\s+CHART_SHEEN_PERIOD_MS\s*=\s*(\d+)/,
            );
            expect(m).not.toBeNull();
            expect(Number(m![1])).toBeGreaterThanOrEqual(4000);
        });
    });

    describe('DonutChart wiring', () => {
        it('renders a <ChartSheenSweep> def with the sheenRef attached', () => {
            expect(DONUT_SRC).toMatch(
                /const\s+sheenRef\s*=\s*useChartSheen\(/,
            );
            expect(DONUT_SRC).toMatch(
                /<ChartSheenSweep[\s\S]*?ref=\{sheenRef\}[\s\S]*?id=\{chartSheenId\(chartId\)\}/,
            );
        });

        it('each segment paints a third layer filled with the sheen def, inside the inert visual group', () => {
            // colour → gloss → sheen, all `<motion.path>` for the
            // R18-PR11 data-change morph. The sheen FILL must be
            // present...
            expect(DONUT_SRC).toMatch(
                /fill=\{`url\(#\$\{chartSheenId\(chartId\)\}\)`\}/,
            );
            // ...and the layers live inside the popped visual group
            // that carries `pointerEvents="none"` + `aria-hidden`
            // (the hover-tremble fix moved inertness from each path to
            // the shared group; a SEPARATE hit path owns the hover).
            expect(DONUT_SRC).toMatch(
                /transform=\{popTransform\}\s*\n?\s*pointerEvents="none"\s*\n?\s*aria-hidden="true"/,
            );
        });
    });
});
