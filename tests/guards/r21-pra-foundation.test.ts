/**
 * R21-PR-A — Sculpted Charts foundation ratchet.
 *
 * Roadmap-21 (Sculpted Charts) rebuilds Sankey, RiskHeatmap,
 * CalendarHeatmap, FunnelChart, and lands a 3D WebGL chart family
 * via react-three-fiber. PR-A drops the language pieces every
 * following PR consumes:
 *
 *   • `useHeatScale` — value-to-colour mapping over the R16
 *     chart-series tokens (consumed by PR-C's RiskHeatmap +
 *     CalendarHeatmap rebuilds).
 *   • `<ChartLegend>` — shared series / gradient legend primitive
 *     (consumed by PR-B's Sankey series legend + PR-C's heatmap
 *     gradient legends).
 *   • Barrel re-exports + types so consumers import from the
 *     single `@/components/ui/charts` entry point.
 *
 * PR-A wires nothing into existing chart consumers — it lands as
 * pure foundation. The ratchet locks the API surface so
 * PR-B/C/D/E/F can wire to it without fear of drift.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

// Import only the pure-function helpers from use-heat-scale (the
// hook + React-rendering surfaces are verified structurally
// against source below). This ratchet runs in the node project,
// not jsdom — `@dub/utils` / DOM-coupled tests live in
// tests/rendered/ if they need to be added later.
import {
    buildHeatColorMix,
    buildStepValues,
    clampIntensity,
} from '@/components/ui/charts/use-heat-scale';

const ROOT = path.resolve(__dirname, '../..');
const BARREL = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/index.ts'),
    'utf8',
);
const HEAT_SCALE = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/use-heat-scale.ts'),
    'utf8',
);
const CHART_LEGEND = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-legend.tsx'),
    'utf8',
);

describe('R21-PR-A — Sculpted Charts foundation', () => {
    describe('the foundation files exist + are re-exported', () => {
        it('use-heat-scale.ts is present', () => {
            expect(
                fs.existsSync(
                    path.join(
                        ROOT,
                        'src/components/ui/charts/use-heat-scale.ts',
                    ),
                ),
            ).toBe(true);
        });

        it('chart-legend.tsx is present', () => {
            expect(
                fs.existsSync(
                    path.join(
                        ROOT,
                        'src/components/ui/charts/chart-legend.tsx',
                    ),
                ),
            ).toBe(true);
        });

        it('barrel re-exports `useHeatScale` and helpers', () => {
            expect(BARREL).toMatch(/export\s+\{[\s\S]*?useHeatScale[\s\S]*?\}/);
            expect(BARREL).toMatch(/buildHeatColorMix/);
            expect(BARREL).toMatch(/buildStepValues/);
            expect(BARREL).toMatch(/clampIntensity/);
        });

        it('barrel re-exports `HeatScale` + `HeatScaleOptions` types', () => {
            expect(BARREL).toMatch(/HeatScale[,\s]/);
            expect(BARREL).toMatch(/HeatScaleOptions/);
        });

        it('barrel re-exports `ChartLegend` + entry/prop types', () => {
            expect(BARREL).toMatch(/export\s+\{[\s\S]*?ChartLegend[\s\S]*?\}/);
            expect(BARREL).toMatch(/seriesDotBackground/);
            expect(BARREL).toMatch(/ChartLegendProps/);
            expect(BARREL).toMatch(/ChartLegendSeriesEntry/);
        });
    });

    describe('`clampIntensity` — pure interpolation math', () => {
        it('returns the floor at min, the ceiling at max', () => {
            expect(clampIntensity(0, [0, 100], [0.15, 1])).toBeCloseTo(0.15);
            expect(clampIntensity(100, [0, 100], [0.15, 1])).toBeCloseTo(1);
        });
        it('linearly interpolates between min and max', () => {
            expect(clampIntensity(50, [0, 100], [0, 1])).toBeCloseTo(0.5);
            expect(clampIntensity(25, [0, 100], [0, 1])).toBeCloseTo(0.25);
        });
        it('clamps below-min to floor', () => {
            expect(clampIntensity(-50, [0, 100], [0.2, 1])).toBeCloseTo(0.2);
        });
        it('clamps above-max to ceiling', () => {
            expect(clampIntensity(200, [0, 100], [0.2, 1])).toBeCloseTo(1);
        });
        it('handles degenerate min===max by returning the ceiling', () => {
            expect(clampIntensity(5, [5, 5], [0.2, 0.8])).toBeCloseTo(0.8);
        });
        it('respects the default range [0.15, 1]', () => {
            // No range arg — the default floor 0.15 must apply.
            expect(clampIntensity(0, [0, 100])).toBeCloseTo(0.15);
        });
    });

    describe('`buildHeatColorMix` — token-driven color-mix expression', () => {
        it('uses the OKLAB interpolation method', () => {
            // oklab is load-bearing — naive RGB interpolation gives
            // muddy midtones at sharp hue transitions. R16 charts
            // already use OKLAB in their SVG gradients (via
            // gradient-interpolation-method); the heat scale
            // matches.
            const out = buildHeatColorMix(1, 0.5);
            expect(out).toMatch(/in oklab/);
        });
        it('references the correct series start/end tokens', () => {
            const out = buildHeatColorMix(3, 0.7);
            expect(out).toContain('var(--chart-series-3-end)');
            expect(out).toContain('var(--chart-series-3-start)');
        });
        it('maps intensity to a 0-100 percentage on the end stop', () => {
            // intensity 0.5 → 50% end + start.
            expect(buildHeatColorMix(1, 0.5)).toMatch(/50%/);
            // intensity 0.25 → 25%.
            expect(buildHeatColorMix(1, 0.25)).toMatch(/25%/);
            // intensity 1 → 100%.
            expect(buildHeatColorMix(1, 1)).toMatch(/100%/);
        });
    });

    describe('`buildStepValues` — legend tick generator', () => {
        it('returns steps+1 values (inclusive of min and max)', () => {
            expect(buildStepValues([0, 100], 5)).toEqual([
                0, 20, 40, 60, 80, 100,
            ]);
        });
        it('handles a domain that starts above zero', () => {
            expect(buildStepValues([10, 30], 4)).toEqual([10, 15, 20, 25, 30]);
        });
    });

    describe('`useHeatScale` — composed hook surface (structural)', () => {
        // Direct hook invocation belongs in a jsdom-env rendered test
        // (tests/rendered/), not this node-env guard ratchet. We
        // still verify the hook's API surface via source assertions
        // so a future refactor that drops a return field fails fast.
        it('returns colorFor + intensityFor functions', () => {
            expect(HEAT_SCALE).toMatch(/colorFor:\s*\(value: number\)/);
            expect(HEAT_SCALE).toMatch(/intensityFor:\s*\(value: number\)/);
        });
        it('returns gradientId, startVar, endVar, series, domain, stepValues', () => {
            for (const field of [
                'gradientId',
                'startVar',
                'endVar',
                'series',
                'domain',
                'stepValues',
            ]) {
                expect(HEAT_SCALE).toMatch(new RegExp(`${field}\\s*:`));
            }
        });
        it('defaults series to 1 + idPrefix to "heat"', () => {
            expect(HEAT_SCALE).toMatch(/series\s*=\s*1/);
            expect(HEAT_SCALE).toMatch(/idPrefix\s*=\s*['"]heat['"]/);
        });
        it('wraps the body in useMemo so consumer rerenders cheaply', () => {
            expect(HEAT_SCALE).toMatch(/useMemo<HeatScale>/);
        });
    });

    describe('`<ChartLegend>` two-variant structure', () => {
        it('the series variant renders a `<ul>` with `<li>` entries', () => {
            expect(CHART_LEGEND).toMatch(
                /data-chart-legend-variant="series"/,
            );
            expect(CHART_LEGEND).toMatch(/<ul/);
            expect(CHART_LEGEND).toMatch(/<li/);
        });
        it('the gradient variant renders an SVG referencing the heatScale gradient id', () => {
            expect(CHART_LEGEND).toMatch(
                /data-chart-legend-variant="gradient"/,
            );
            expect(CHART_LEGEND).toMatch(/heatScale\.gradientId/);
            expect(CHART_LEGEND).toMatch(/heatScale\.startVar/);
            expect(CHART_LEGEND).toMatch(/heatScale\.endVar/);
        });
        it('the gradient variant assigns role="img" + aria-label', () => {
            expect(CHART_LEGEND).toMatch(/role="img"/);
            expect(CHART_LEGEND).toMatch(/aria-label/);
        });
        it('`seriesDotBackground` helper exposes the dot composition rule', () => {
            // Structural check — the helper exists and prefers
            // explicit color over series index, otherwise falls
            // back to a 135deg gradient.
            expect(CHART_LEGEND).toMatch(
                /export\s+function\s+seriesDotBackground/,
            );
            expect(CHART_LEGEND).toMatch(/linear-gradient\(135deg/);
        });
    });

    describe('`useHeatScale` head matter documents the consumer contract', () => {
        // Foundation files in this codebase document the WHY at the
        // top of the file. PR-B/C consumers will re-read it; if a
        // future "simplify" pass strips the doc-block, this fires.
        it('documents that PR-C is the first consumer', () => {
            expect(HEAT_SCALE).toMatch(/PR-?C/i);
        });
        it('documents the oklab interpolation rationale', () => {
            expect(HEAT_SCALE).toMatch(/oklab/i);
        });
        it('documents the gradient-continuity-with-legend contract', () => {
            expect(HEAT_SCALE).toMatch(/legend/i);
            expect(HEAT_SCALE).toMatch(/continuous/i);
        });
    });
});
