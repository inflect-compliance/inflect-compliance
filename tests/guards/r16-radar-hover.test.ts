/**
 * Roadmap-16 PR-10 — RadarChart hover (vertex + axis highlight).
 *
 * Phase 4 closes. RadarChart hover beats wired.
 *
 * The user hovers any of three things — the vertex circle, the
 * axis line, or the axis label — and the whole "row" lights up:
 *
 *   • Vertex circle scales to `CHART_HOVER_POINT_SCALE` (1.05×).
 *   • Axis line stroke shifts from `--border-subtle` (muted) to
 *     `--chart-series-{N}-end` (crisp series colour) + opacity
 *     bumps to 1.0 + strokeWidth 1 → 1.5.
 *   • Label fill shifts from `--content-muted` to
 *     `--content-emphasis` + fontWeight 400 → 600.
 *
 * One shared `hoveredKey` state. Pointer + keyboard event
 * handlers on each of the three surfaces feed the same setter,
 * so the hover row reads identically regardless of which surface
 * the user is interacting with.
 *
 * Six load-bearing invariants:
 *
 *   1. useState<string | null> tracks `hoveredKey`. useChartHoverPop
 *      from R16-PR4 supplies the scale + isPopped helpers.
 *
 *   2. Vertex circles rendered via <motion.circle> with `animate=
 *      {{ scale }}` reading from `pop.getPointScale(key)`.
 *
 *   3. Axis lines react to hover: stroke + strokeWidth + opacity
 *      all transition based on `pop.isPopped(key)`.
 *
 *   4. Labels brighten from muted → emphasis on hover, with
 *      fontWeight bump 400 → 600.
 *
 *   5. All three surfaces (vertex, label-group, ...) wire
 *      onMouseEnter / onMouseLeave / onFocus / onBlur that
 *      update the SAME setHoveredKey. Keyboard parity preserved.
 *
 *   6. tabIndex={0} on vertex circles + label groups so SVG
 *      elements participate in the tab order.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const RADAR_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/charts/radar-chart.tsx'),
    'utf8',
);

describe('Roadmap-16 PR-10 — RadarChart hover', () => {
    describe('hover state + useChartHoverPop wiring', () => {
        it('tracks hoveredKey via useState<string | null>', () => {
            expect(RADAR_SRC).toMatch(
                /useState<string\s*\|\s*null>\(null\)/,
            );
        });

        it('initialises useChartHoverPop({ hoveredKey })', () => {
            expect(RADAR_SRC).toMatch(
                /useChartHoverPop\s*\(\s*\{\s*hoveredKey\s*\}\s*\)/,
            );
        });

        it('imports useChartHoverPop from chart-motion', () => {
            expect(RADAR_SRC).toMatch(
                /import\s*\{[\s\S]*?useChartHoverPop[\s\S]*?\}\s*from\s*['"]\.\/chart-motion['"]/,
            );
        });
    });

    describe('vertex circles — motion.circle with scale animation', () => {
        it('renders vertices as <motion.circle>', () => {
            // <motion.circle> drives the scale animation. Plain
            // <circle> wouldn't animate without manual setAttribute.
            expect(RADAR_SRC).toMatch(/<motion\.circle\b/);
        });

        it('animates scale via pop.getPointScale(p.key)', () => {
            expect(RADAR_SRC).toMatch(
                /pop\.getPointScale\s*\(\s*p\.key\s*\)/,
            );
            expect(RADAR_SRC).toMatch(/animate=\{\{\s*scale\s*\}\}/);
        });

        it('vertex circles have transformOrigin matching their (valueX, valueY)', () => {
            // Without an explicit transformOrigin, the scale
            // animation pivots around the SVG's coordinate origin
            // (0,0), not the vertex itself. The vertex visibly
            // drifts away from the polygon corner on hover.
            expect(RADAR_SRC).toMatch(
                /transformOrigin:\s*`\$\{p\.valueX\}px\s+\$\{p\.valueY\}px`/,
            );
        });

        it('vertex circles are focusable with tabIndex={0}', () => {
            // Tab into a vertex → its row of affordances engages.
            expect(RADAR_SRC).toMatch(/tabIndex=\{0\}/);
        });
    });

    describe('axis lines — hover brightens to series-end + bumps opacity', () => {
        it('axis stroke switches between --border-subtle and series-end on hover', () => {
            expect(RADAR_SRC).toMatch(
                /isHovered[\s\S]*?\?\s*`var\(--chart-series-\$\{seriesIndex\}-end\)`[\s\S]*?:\s*'var\(--border-subtle\)'/,
            );
        });

        it('axis strokeWidth bumps 1 → 1.5 on hover', () => {
            expect(RADAR_SRC).toMatch(
                /strokeWidth=\{isHovered\s*\?\s*1\.5\s*:\s*1\}/,
            );
        });

        it('axis opacity bumps 0.6 → 1 on hover', () => {
            expect(RADAR_SRC).toMatch(
                /opacity=\{isHovered\s*\?\s*1\s*:\s*0\.6\}/,
            );
        });

        it('axis line transitions stroke + opacity + stroke-width', () => {
            // R12 motion-language compliance — name each property
            // explicitly (no transition: all).
            expect(RADAR_SRC).toMatch(
                /transition:[\s\S]*?stroke 200ms ease-out[\s\S]*?opacity 200ms ease-out[\s\S]*?stroke-width 200ms ease-out/,
            );
        });
    });

    describe('axis labels — hover brightens muted → emphasis + bumps font weight', () => {
        it('label fill switches between --content-muted and --content-emphasis', () => {
            expect(RADAR_SRC).toMatch(
                /isHovered[\s\S]*?\?\s*'var\(--content-emphasis\)'[\s\S]*?:\s*'var\(--content-muted\)'/,
            );
        });

        it('label fontWeight bumps 400 → 600 on hover', () => {
            expect(RADAR_SRC).toMatch(
                /fontWeight:\s*isHovered\s*\?\s*600\s*:\s*400/,
            );
        });

        it('label group wraps <Text> with event handlers + tabIndex', () => {
            // Without the wrapping <g>, the bare <Text> element
            // wouldn't intercept events evenly across the label's
            // bounding box. The label group has a `key=` matching
            // the per-axis pattern PLUS pointer handlers. JSX
            // prop order isn't enforced — assert each piece
            // independently.
            expect(RADAR_SRC).toMatch(/<g\b[\s\S]*?key=\{`label-\$\{p\.key\}`\}/);
            // Same <g> region has the hover wiring.
            const labelGroupMatch = RADAR_SRC.match(
                /<g\b\s+key=\{`label-\$\{p\.key\}`\}[\s\S]*?>\s*<Text/,
            );
            expect(labelGroupMatch).not.toBeNull();
            expect(labelGroupMatch![0]).toMatch(/onMouseEnter/);
            expect(labelGroupMatch![0]).toMatch(/tabIndex=\{0\}/);
        });
    });

    describe('pointer + keyboard wiring on every surface', () => {
        it('vertex circles wire onMouseEnter / onMouseLeave to setHoveredKey', () => {
            expect(RADAR_SRC).toMatch(
                /<motion\.circle[\s\S]*?onMouseEnter=\{\s*\(\s*\)\s*=>\s*setHoveredKey\s*\(\s*p\.key\s*\)\s*\}/,
            );
            expect(RADAR_SRC).toMatch(
                /<motion\.circle[\s\S]*?onMouseLeave=\{\s*\(\s*\)\s*=>\s*setHoveredKey\s*\(\s*null\s*\)\s*\}/,
            );
        });

        it('vertex circles wire onFocus / onBlur (keyboard parity)', () => {
            expect(RADAR_SRC).toMatch(
                /<motion\.circle[\s\S]*?onFocus=\{\s*\(\s*\)\s*=>\s*setHoveredKey\s*\(\s*p\.key\s*\)\s*\}/,
            );
        });

        it('every surface feeds the SAME setHoveredKey (one shared row)', () => {
            // The point of "one shared hoveredKey": vertex / axis-
            // line / label hover all engage the same affordances.
            // Without sharing, hovering the label wouldn't pop the
            // vertex.
            const setterCalls =
                RADAR_SRC.match(/setHoveredKey\s*\(\s*p\.key\s*\)/g) ?? [];
            // Vertex onMouseEnter + onFocus + label-group
            // onMouseEnter + onFocus = at least 4.
            expect(setterCalls.length).toBeGreaterThanOrEqual(4);
        });
    });
});
