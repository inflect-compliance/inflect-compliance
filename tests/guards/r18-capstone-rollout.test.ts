/**
 * R18 capstone — Charts II: Fluid & Glossy rollout index.
 *
 * Locks the bundled contract for the Roadmap-18 set. Each per-PR
 * ratchet locks the surface it added; this capstone is the
 * INVENTORY — proves the 11 deliverables are still wired up
 * after future refactors, and proves no PR was silently
 * reverted.
 *
 * Roadmap summary:
 *
 *   Foundations
 *     PR-1  — `<ChartGloss>` specular-highlight primitive
 *             (white→transparent overlay ramp).
 *     PR-2  — `useChartSpring` bubbly-settle entrance spring
 *             (easeOutBack, SSR-safe).
 *     PR-3  — soft-shadow token + `chart-bubble-in` keyframes
 *             (the CSS-side bubble vocabulary).
 *
 *   Donut
 *     PR-4  — donut gloss sheen (the two-layer paint).
 *     PR-5  — donut bubble-entrance (group scale via the spring).
 *
 *   Line / area
 *     PR-6  — MiniAreaChart liquid-fill gloss.
 *     PR-7  — LineChart glossy area + bubbly (spring) focus point.
 *
 *   Bars
 *     PR-8  — bubbly bars (settle-bounce + gloss + rounder tops).
 *     PR-9  — bar hover bubble-out (per-bar spring scale).
 *
 *   Polish
 *     PR-10 — `<ChartSheenSweep>` + `useChartSheen` periodic
 *             light pan, wired into the donut.
 *     PR-11 — fluid data-change morphing (donut `<motion.path>`
 *             `d` interpolation).
 *     PR-12 — this capstone bundle ratchet + docs/charts-fluid.md.
 *
 * Adding a 12th R18 surface? Append the assertion here, write
 * the per-PR ratchet next to it, and update docs/charts-fluid.md.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');

const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const GLOSS = read('src/components/ui/charts/chart-gloss.tsx');
const MOTION = read('src/components/ui/charts/chart-motion.tsx');
const TOKENS = read('src/styles/tokens.css');
const TW = read('tailwind.config.js');
const DONUT = read('src/components/ui/DonutChart.tsx');
const MINI_AREA = read('src/components/ui/mini-area-chart.tsx');
const LINE = read('src/components/ui/charts/line-chart.tsx');
const BARS = read('src/components/ui/charts/bars.tsx');
const BARREL = read('src/components/ui/charts/index.ts');

describe('R18 capstone — Charts II: Fluid & Glossy rollout', () => {
    describe('Foundations (PR-1..3)', () => {
        it('PR-1: ChartGloss primitive — linearGradient def + chartGlossId', () => {
            expect(GLOSS).toMatch(
                /export\s+function\s+ChartGloss\(/,
            );
            expect(GLOSS).toMatch(
                /export\s+function\s+chartGlossId\(/,
            );
            expect(BARREL).toMatch(/ChartGloss,\s*chartGlossId/);
        });

        it('PR-2: useChartSpring — SSR-safe easeOutBack entrance spring', () => {
            expect(MOTION).toMatch(/export\s+function\s+useChartSpring\(/);
            expect(MOTION).toMatch(/function\s+easeOutBack\(/);
            // SSR-safe: initial useState is 1.
            expect(MOTION).toMatch(
                /useChartSpring[\s\S]*?useState\(1\)/,
            );
        });

        it('PR-3: soft-shadow token + chart-bubble-in keyframe', () => {
            // Token defined in both theme blocks.
            expect(
                (TOKENS.match(/--chart-soft-shadow:/g) ?? []).length,
            ).toBe(2);
            expect(TW).toMatch(
                /'chart-soft':\s*'var\(--chart-soft-shadow\)'/,
            );
            expect(TW).toMatch(/'chart-bubble-in':\s*\{/);
        });
    });

    describe('Donut (PR-4, PR-5)', () => {
        it('PR-4: donut gloss sheen — shared ChartGloss def + overlay path', () => {
            expect(DONUT).toMatch(/<ChartGloss\s+id=\{chartGlossId\(chartId\)\}/);
            expect(DONUT).toMatch(
                /fill=\{`url\(#\$\{chartGlossId\(chartId\)\}\)`\}/,
            );
        });

        it('PR-5: donut bubble-entrance — useChartSpring drives the centring <g> scale', () => {
            expect(DONUT).toMatch(
                /const\s+entranceProgress\s*=\s*useChartSpring\(\)/,
            );
            expect(DONUT).toMatch(
                /transform=\{`translate\(\$\{center\},\$\{center\}\)\s+scale\(\$\{entranceProgress\}\)`\}/,
            );
        });
    });

    describe('Line / area (PR-6, PR-7)', () => {
        it('PR-6: MiniAreaChart liquid-fill gloss — subtle ChartGloss + gloss motion.path', () => {
            expect(MINI_AREA).toMatch(
                /<ChartGloss[\s\S]*?intensity="subtle"/,
            );
            expect(MINI_AREA).toMatch(
                /fill=\{`url\(#\$\{chartGlossId\(id\)\}\)`\}/,
            );
        });

        it('PR-7: LineChart glossy area + spring focus point', () => {
            expect(LINE).toMatch(
                /<ChartGloss[\s\S]*?intensity="default"/,
            );
            // Focus point scales in via a spring.
            expect(LINE).toMatch(
                /scale:\s*\{\s*type:\s*['"]spring['"]/,
            );
        });
    });

    describe('Bars (PR-8, PR-9)', () => {
        it('PR-8: bubbly bars — settle-bounce scaleY spring + shared gloss def + radius 3', () => {
            expect(BARS).toMatch(/radius\s*=\s*3\b/);
            expect(BARS).toMatch(
                /scaleY:\s*\{\s*type:\s*["']spring["']/,
            );
            expect(BARS).toMatch(/<ChartGloss\s+id=\{chartGlossId\(chartId\)\}/);
        });

        it('PR-9: bar hover bubble-out — per-bar keyed hover state + spring scale', () => {
            expect(BARS).toMatch(
                /const\s+\[hoveredBarKey,\s*setHoveredBarKey\]/,
            );
            expect(BARS).toMatch(
                /animate=\{\{\s*scale:\s*isHovered\s*\?\s*BAR_HOVER_SCALE\s*:\s*1\s*\}\}/,
            );
        });
    });

    describe('Polish (PR-10, PR-11)', () => {
        it('PR-10: ChartSheenSweep + useChartSheen, wired into the donut', () => {
            expect(GLOSS).toMatch(
                /export\s+const\s+ChartSheenSweep\s*=\s*forwardRef</,
            );
            expect(MOTION).toMatch(/export\s+function\s+useChartSheen\(/);
            expect(MOTION).toMatch(
                /export\s+const\s+CHART_SHEEN_PERIOD_MS\s*=\s*\d+/,
            );
            expect(DONUT).toMatch(
                /const\s+sheenRef\s*=\s*useChartSheen\(/,
            );
        });

        it('PR-11: fluid data-change morph — donut motion.path with initial={false}', () => {
            // Three motion.path layers, all with initial={false}.
            const initialFalse = DONUT.match(/initial=\{false\}/g);
            expect(initialFalse).not.toBeNull();
            expect(initialFalse!.length).toBe(3);
            const animateD = DONUT.match(
                /animate=\{\{\s*d:\s*path\s*\}\}/g,
            );
            expect(animateD!.length).toBe(3);
        });
    });

    describe('Reduced-motion posture', () => {
        it('every R18 motion hook routes through the shared useReducedMotion', () => {
            // useChartSpring + useChartSheen both gate on it. The
            // CSS keyframes are flattened by the global
            // prefers-reduced-motion rule in tokens.css.
            const springGatesReduced =
                /useChartSpring[\s\S]*?useReducedMotion\(\)/.test(MOTION);
            const sheenGatesReduced =
                /useChartSheen[\s\S]*?useReducedMotion\(\)/.test(MOTION);
            expect(springGatesReduced).toBe(true);
            expect(sheenGatesReduced).toBe(true);
        });
    });
});
