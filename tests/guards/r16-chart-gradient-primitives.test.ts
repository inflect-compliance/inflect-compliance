/**
 * Roadmap-16 PR-2 — ChartGradient primitive library.
 *
 * Three SVG gradient primitives (`<ChartLinearGradient>`,
 * `<ChartRadialGradient>`, `<ChartFlowGradient>`) + an id helper
 * + a series-index type. Centralised so every R16 chart consumer
 * paints from the same gradient defs.
 *
 * Six load-bearing invariants:
 *
 *   1. The primitive file exists at the canonical path.
 *   2. All three primitive components + the id helper + the
 *      series-index type are exported.
 *   3. Stops resolve through R16-PR1 CSS variables (no hex
 *      literals inside the primitives — values come from the
 *      token layer).
 *   4. `<ChartFlowGradient>` uses the 3-stop `start → end → start`
 *      cyclic pattern so R16-PR4's `useChartFlow` can pan
 *      `gradientTransform` without a seam at every cycle.
 *   5. `<ChartFlowGradient>` carries `gradientUnits="userSpaceOnUse"`
 *      and `gradientTransform="translate(0,0)"` as the IDENTITY
 *      starting point PR-4 animates from.
 *   6. The primitives are re-exported from the charts barrel so
 *      consumers import via `@/components/ui/charts`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const PRIMITIVE_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/chart-gradient.tsx'),
    'utf8',
);
const BARREL_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/index.ts'),
    'utf8',
);

describe('Roadmap-16 PR-2 — ChartGradient primitive library', () => {
    describe('file structure + exports', () => {
        it('exports <ChartLinearGradient>', () => {
            expect(PRIMITIVE_SRC).toMatch(
                /export\s+function\s+ChartLinearGradient\s*\(/,
            );
        });

        it('exports <ChartRadialGradient>', () => {
            expect(PRIMITIVE_SRC).toMatch(
                /export\s+function\s+ChartRadialGradient\s*\(/,
            );
        });

        it('exports <ChartFlowGradient> as a forwardRef component', () => {
            // forwardRef so R16-PR4 `useChartFlow` can attach a
            // ref to the underlying <linearGradient>. The hook
            // imperatively writes gradientTransform on every
            // animation frame.
            expect(PRIMITIVE_SRC).toMatch(
                /export\s+const\s+ChartFlowGradient\s*=\s*forwardRef</,
            );
        });

        it('exports the chartGradientId helper', () => {
            expect(PRIMITIVE_SRC).toMatch(
                /export\s+function\s+chartGradientId\s*\(/,
            );
        });

        it('exports the ChartSeriesIndex type union locked at 1..6', () => {
            // Six is the locked palette size (R16-PR1). The union
            // type signature commits to it at compile time.
            expect(PRIMITIVE_SRC).toMatch(
                /export\s+type\s+ChartSeriesIndex\s*=\s*1\s*\|\s*2\s*\|\s*3\s*\|\s*4\s*\|\s*5\s*\|\s*6\s*;/,
            );
        });

        it('exports the ChartGradientDirection type union', () => {
            expect(PRIMITIVE_SRC).toMatch(
                /export\s+type\s+ChartGradientDirection\s*=\s*'horizontal'\s*\|\s*'vertical'\s*\|\s*'diagonal'\s*;/,
            );
        });
    });

    describe('stops resolve through R16-PR1 CSS variables', () => {
        it('reads start-stop from var(--chart-series-N-start) — no inline hex', () => {
            // The primitives MUST resolve through CSS variables so
            // theme-switching at the token layer re-themes every
            // chart for free. An inline HEX literal here would
            // sever that wire.
            expect(PRIMITIVE_SRC).toMatch(
                /`var\(--chart-series-\$\{series\}-start\)`/,
            );
            expect(PRIMITIVE_SRC).toMatch(
                /`var\(--chart-series-\$\{series\}-end\)`/,
            );
        });

        it('contains no inline hex colour literals anywhere in the primitive', () => {
            // Defensive: a `#000000` or `#fff` slipping into a
            // string literal would short-circuit the token
            // resolution. The whole primitive file MUST be free
            // of HEX colour literals — all colours come from CSS
            // vars resolved at render time. The `stopColor={start}`
            // props legitimately reference local consts populated
            // by `seriesStops()`, which builds the `var(...)`
            // expression — so the assertion is at file level.
            const hexMatches = PRIMITIVE_SRC.match(/#[0-9A-Fa-f]{3,6}\b/g) ?? [];
            expect(hexMatches).toEqual([]);
        });
    });

    describe('<ChartLinearGradient> shape', () => {
        it('emits two stops (start at 0%, end at 100%)', () => {
            // Locate the LinearGradient function body. The two
            // <stop> elements with offsets 0% and 100% are the
            // canonical 2-stop linear-gradient shape.
            const linearMatch = PRIMITIVE_SRC.match(
                /function\s+ChartLinearGradient[\s\S]*?return\s*\(\s*([\s\S]*?)\s*\)\s*;[\s\S]*?\n\}/,
            );
            expect(linearMatch).not.toBeNull();
            const body = linearMatch![1];
            const stops = body.match(/<stop\b[^/]*\/>/g) ?? [];
            expect(stops.length).toBe(2);
            expect(stops[0]).toContain('offset="0%"');
            expect(stops[1]).toContain('offset="100%"');
        });
    });

    describe('<ChartFlowGradient> — the 3-stop cyclic pattern (R16-PR4 substrate)', () => {
        function getFlowBody(): string {
            // ChartFlowGradient is `forwardRef(function ChartFlowGradient(...) {...})`.
            // Match the inner `function ChartFlowGradient` body so
            // the assertions don't pick up the outer const/export.
            const flowMatch = PRIMITIVE_SRC.match(
                /function\s+ChartFlowGradient\s*\([\s\S]*?return\s*\(\s*([\s\S]*?)\s*\)\s*;[\s\S]*?\n\}/,
            );
            expect(flowMatch).not.toBeNull();
            return flowMatch![1];
        }

        it('emits THREE stops (start at 0%, end at 50%, start again at 100%)', () => {
            const body = getFlowBody();
            const stops = body.match(/<stop\b[^/]*\/>/g) ?? [];
            expect(stops.length).toBe(3);
            expect(stops[0]).toContain('offset="0%"');
            expect(stops[1]).toContain('offset="50%"');
            expect(stops[2]).toContain('offset="100%"');
        });

        it('uses the cyclic `start → end → start` pattern (closes the loop)', () => {
            // The 0% and 100% stops MUST be the same colour so the
            // gradient-pan animation in R16-PR4 has no seam at
            // every cycle. The middle 50% stop is `end`.
            const body = getFlowBody();
            const stops = body.match(/<stop\b[^/]*\/>/g) ?? [];
            expect(stops.length).toBe(3);
            const firstColour = stops[0]?.match(
                /stopColor=\{([^}]+)\}/,
            )?.[1];
            const lastColour = stops[2]?.match(
                /stopColor=\{([^}]+)\}/,
            )?.[1];
            expect(firstColour).toBe(lastColour);
        });

        it('declares `gradientUnits="userSpaceOnUse"`', () => {
            // userSpaceOnUse makes the gradient resolve in the
            // SVG's coordinate space. R16-PR4's pan-by-translate
            // depends on this — a `objectBoundingBox`-relative
            // gradient panned by translate would behave per-shape.
            const body = getFlowBody();
            expect(body).toContain('gradientUnits="userSpaceOnUse"');
        });

        it('declares `gradientTransform="translate(0,0)"` (PR-4 animates this)', () => {
            // The identity transform is the starting point PR-4's
            // `useChartFlow` animates AWAY from. The hook will
            // rewrite this attribute over time to pan the gradient.
            const body = getFlowBody();
            expect(body).toContain('gradientTransform="translate(0,0)"');
        });

        it('carries a `data-chart-flow="true"` marker for downstream selection', () => {
            // The marker lets `useChartFlow` (R16-PR4) and any
            // future test fixture select flow gradients without
            // needing to know individual ids. Cheap to keep,
            // load-bearing for the upcoming hook.
            const body = getFlowBody();
            expect(body).toContain('data-chart-flow="true"');
        });
    });

    describe('barrel re-exports', () => {
        it('barrel re-exports ChartLinearGradient + ChartRadialGradient + ChartFlowGradient + chartGradientId', () => {
            expect(BARREL_SRC).toMatch(/ChartLinearGradient/);
            expect(BARREL_SRC).toMatch(/ChartRadialGradient/);
            expect(BARREL_SRC).toMatch(/ChartFlowGradient/);
            expect(BARREL_SRC).toMatch(/chartGradientId/);
            // ...sourced from './chart-gradient'
            expect(BARREL_SRC).toMatch(/from\s+['"]\.\/chart-gradient['"]/);
        });

        it('barrel re-exports the ChartSeriesIndex + ChartGradientDirection types', () => {
            expect(BARREL_SRC).toMatch(
                /export\s+type\s*\{[\s\S]*?ChartSeriesIndex/,
            );
            expect(BARREL_SRC).toMatch(
                /export\s+type\s*\{[\s\S]*?ChartGradientDirection/,
            );
        });
    });
});
