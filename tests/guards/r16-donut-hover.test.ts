/**
 * Roadmap-16 PR-6 — DonutChart hover (pop + gradient flow).
 *
 * R16-PR5 rebuilt the donut on visx + R16 gradients but kept the
 * resting state only. PR-6 wires the hover beats from the
 * R16-PR4 motion hooks: segment translate outward + gradient flow
 * pan on the hovered segment.
 *
 * The "pop": hovered segment translates radially outward by 4 px
 * (user-confirmed "subtle" intensity). The radial direction comes
 * from the arc's mid-angle. Adjacent segments stay put — only
 * the one under the cursor responds.
 *
 * The "flow": hovered segment swaps its fill from the resting
 * `<ChartRadialGradient>` to the `<ChartFlowGradient>` whose
 * `gradientTransform` translate animates via `useChartFlow`.
 * The 3-stop cyclic pattern (R16-PR2) means panning by `distance`
 * returns to the same colour — the loop has no visible seam.
 *
 * Seven load-bearing invariants:
 *
 *   1. Imports useChartHoverPop + useChartFlow from R16-PR4.
 *   2. Imports ChartFlowGradient from R16-PR2.
 *   3. Tracks hoveredKey via useState (single state shared across
 *      all segments).
 *   4. Computes pop transform via `pop.getDonutTransform(label,
 *      midAngle)` per segment.
 *   5. Hovered-segment fill resolves to the flow gradient url,
 *      resting-segment fill resolves to the radial gradient url.
 *   6. Wires onMouseEnter / onMouseLeave / onFocus / onBlur per
 *      segment so the hover state updates on both pointer AND
 *      keyboard navigation.
 *   7. Flow gradient is rendered conditionally — only when a
 *      segment with seriesIndex is currently hovered.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const DONUT_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/DonutChart.tsx'),
    'utf8',
);

describe('Roadmap-16 PR-6 — DonutChart hover (pop + flow)', () => {
    describe('imports — R16-PR4 motion hooks + R16-PR2 flow primitive', () => {
        it('imports useChartHoverPop + useChartFlow from chart-motion', () => {
            // Order-agnostic — the import-grouper may sort names
            // either way.
            expect(DONUT_SRC).toMatch(
                /import\s*\{[\s\S]*?useChartHoverPop[\s\S]*?\}\s*from\s*['"]@\/components\/ui\/charts\/chart-motion['"]/,
            );
            expect(DONUT_SRC).toMatch(
                /import\s*\{[\s\S]*?useChartFlow[\s\S]*?\}\s*from\s*['"]@\/components\/ui\/charts\/chart-motion['"]/,
            );
        });

        it('imports ChartFlowGradient from chart-gradient', () => {
            expect(DONUT_SRC).toMatch(
                /import\s*\{[\s\S]*?ChartFlowGradient[\s\S]*?\}\s*from\s*['"]@\/components\/ui\/charts\/chart-gradient['"]/,
            );
        });

        it('imports useState from react', () => {
            expect(DONUT_SRC).toMatch(
                /import\s*\{[\s\S]*?useState[\s\S]*?\}\s*from\s*['"]react['"]/,
            );
        });
    });

    describe('hover state — useState keyed by segment label', () => {
        it('declares hoveredKey + setHoveredKey via useState', () => {
            expect(DONUT_SRC).toMatch(
                /const\s+\[hoveredKey,\s*setHoveredKey\]\s*=\s*useState<string\s*\|\s*null>\(null\)/,
            );
        });
    });

    describe('hover-pop transform', () => {
        it('initialises useChartHoverPop({ hoveredKey })', () => {
            expect(DONUT_SRC).toMatch(
                /useChartHoverPop\s*\(\s*\{\s*hoveredKey\s*\}\s*\)/,
            );
        });

        it('computes mid-angle from arc.startAngle + arc.endAngle', () => {
            // visx Arc returns startAngle + endAngle in radians.
            // The "0 at 12 o'clock, clockwise" convention needs
            // -π/2 to convert to the hover-pop hook's "0 at 3
            // o'clock, clockwise". The locked math is:
            //   (start + end) / 2 - PI / 2
            expect(DONUT_SRC).toMatch(
                /\(\s*arc\.startAngle\s*\+\s*arc\.endAngle\s*\)\s*\/\s*2\s*-\s*Math\.PI\s*\/\s*2/,
            );
        });

        it('applies pop transform via getDonutTransform(label, midAngle)', () => {
            // Allow trailing-comma + multi-line formatting from
            // Prettier — the call can break across lines with a
            // trailing comma after `midAngle`.
            expect(DONUT_SRC).toMatch(
                /pop\.getDonutTransform\s*\(\s*seg\.label\s*,\s*midAngle\s*,?\s*\)/,
            );
        });
    });

    describe('gradient flow on hovered segment', () => {
        it('initialises useChartFlow with active when a segment is hovered', () => {
            // The hook becomes active iff flowSeries !== undefined
            // (i.e. the hovered segment has a seriesIndex). Without
            // seriesIndex (legacy color-only) the flow doesn't fire.
            expect(DONUT_SRC).toMatch(/useChartFlow\s*\(\s*\{/);
            expect(DONUT_SRC).toMatch(/active:\s*flowSeries\s*!==\s*undefined/);
        });

        it('renders <ChartFlowGradient> only when a segment with seriesIndex is hovered', () => {
            // Conditional gradient def — keeps the defs block
            // small when nothing is hovered.
            expect(DONUT_SRC).toMatch(
                /\{flowSeries\s*!==\s*undefined\s*&&\s*\(\s*<ChartFlowGradient/,
            );
        });

        it('attaches the useChartFlow ref to <ChartFlowGradient>', () => {
            // Without the ref, useChartFlow can't write to
            // gradientTransform — the animation is a no-op.
            expect(DONUT_SRC).toMatch(/<ChartFlowGradient[\s\S]*?ref=\{flowRef\}/);
        });

        it('swaps fill to flow gradient url when segment is hovered', () => {
            // The fill resolution: hovered → flow url, else radial
            // url (or legacy color). Locked here so a regression
            // to "always radial" would lose the flow effect.
            expect(DONUT_SRC).toMatch(
                /isHovered[\s\S]*?\?[\s\S]*?'flow'[\s\S]*?:[\s\S]*?'radial'/,
            );
        });
    });

    describe('pointer + keyboard event wiring', () => {
        it('updates hoveredKey on onMouseEnter / onMouseLeave', () => {
            expect(DONUT_SRC).toMatch(
                /onMouseEnter=\{\s*\(\s*\)\s*=>\s*setHoveredKey\s*\(\s*seg\.label\s*\)\s*\}/,
            );
            expect(DONUT_SRC).toMatch(
                /onMouseLeave=\{\s*\(\s*\)\s*=>\s*setHoveredKey\s*\(\s*null\s*\)\s*\}/,
            );
        });

        it('updates hoveredKey on onFocus / onBlur (keyboard parity)', () => {
            // Tab into a segment → it should pop just like hover.
            // Without focus handlers, keyboard users get a
            // colourless donut.
            expect(DONUT_SRC).toMatch(
                /onFocus=\{\s*\(\s*\)\s*=>\s*setHoveredKey\s*\(\s*seg\.label\s*\)\s*\}/,
            );
            expect(DONUT_SRC).toMatch(
                /onBlur=\{\s*\(\s*\)\s*=>\s*setHoveredKey\s*\(\s*null\s*\)\s*\}/,
            );
        });

        it('makes segments focusable with tabIndex=0', () => {
            // SVG `<g>` elements aren't focusable by default.
            // tabIndex=0 brings them into the tab order.
            expect(DONUT_SRC).toMatch(/tabIndex=\{0\}/);
        });
    });

    describe('motion language compliance', () => {
        it('uses transition: transform 200ms ease-out for the pop motion', () => {
            // Matches --chart-hover-duration: 200ms. R12 motion
            // language: transition transform only, no compositor
            // work on bg / border. 200ms is the chart-language
            // canonical tempo.
            expect(DONUT_SRC).toMatch(
                /transition:\s*['"]transform 200ms ease-out['"]/,
            );
        });
    });
});
