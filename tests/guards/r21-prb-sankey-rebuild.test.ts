/**
 * R21-PR-B — Sankey rebuild ratchet.
 *
 * The Epic 47.3 SankeyChart shipped with hard-coded hex colours per
 * kind. R21 PR-B routes the Sankey through the R16 chart-series
 * token family + R21 PR-A's `<ChartLegend>` primitive, so the
 * Sankey speaks the same colour vocabulary as every other chart
 * on the dashboard.
 *
 * Six invariants this ratchet locks:
 *
 *   1. The KIND_SERIES mapping exists and routes each
 *      TraceabilityNodeKind to a ChartSeriesIndex.
 *
 *   2. ChartLinearGradient defs are rendered for every kind that
 *      appears (one def per kind, via `presentKinds`).
 *
 *   3. Link strokes paint via `url(#${chartId}-${kind}-gradient)`
 *      — not via hex colours.
 *
 *   4. Node rects paint via the same gradient ids — not hex.
 *
 *   5. The Epic 47.3 inline column-text legend is replaced by
 *      `<ChartLegend variant="series">` from R21-PR-A.
 *
 *   6. Click-isolate state: pinnedId pins the highlight, ESC
 *      unpins, click-outside (on the empty SVG canvas) unpins.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SANKEY = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/SankeyChart.tsx'),
    'utf8',
);

describe('R21-PR-B — Sankey rebuild on chart-series tokens', () => {
    describe('KIND_SERIES kind→series-index mapping', () => {
        it('the mapping const exists', () => {
            expect(SANKEY).toMatch(
                /const\s+KIND_SERIES:\s*Record<TraceabilityNodeKind,\s*ChartSeriesIndex>/,
            );
        });

        it('maps every kind to a chart-series index', () => {
            // All five kinds present + assigned to a valid 1-6 series.
            for (const kind of [
                'asset',
                'risk',
                'control',
                'requirement',
                'policy',
            ]) {
                expect(SANKEY).toMatch(
                    new RegExp(`${kind}:\\s*[1-6]`),
                );
            }
        });

        it('imports ChartLinearGradient + ChartSeriesIndex from the charts barrel', () => {
            expect(SANKEY).toMatch(
                /from\s+['"]@\/components\/ui\/charts['"]/,
            );
            expect(SANKEY).toMatch(/ChartLinearGradient/);
            expect(SANKEY).toMatch(/ChartSeriesIndex/);
        });
    });

    describe('SVG <defs> gradients via R16 ChartLinearGradient', () => {
        it('renders gradients for every kind present in the layout', () => {
            // presentKinds is the load-bearing derivation —
            // walks the layout and emits ONE def per kind in use.
            // We assert the structural pattern, not the exact loop.
            expect(SANKEY).toMatch(/presentKinds\.map\(/);
            expect(SANKEY).toMatch(
                /<ChartLinearGradient[\s\S]*?series=\{KIND_SERIES\[kind\]\}/,
            );
        });

        it('uses horizontal direction so flows read as moving left→right', () => {
            expect(SANKEY).toMatch(/direction="horizontal"/);
        });
    });

    describe('link + node fills use url(#...) gradients, not hex', () => {
        it('link strokes paint via url(#${chartId}-${kind}-gradient)', () => {
            // The link's sourceKind drives the gradient choice; one
            // gradient per kind keeps the SVG defs count bounded.
            expect(SANKEY).toMatch(
                /stroke=\{`url\(#\$\{gradientId\}\)`\}/,
            );
            expect(SANKEY).toMatch(
                /gradientId\s*=\s*`\$\{chartId\}-\$\{link\.sourceKind\}-gradient`/,
            );
        });

        it('node rects paint via the same gradient id family', () => {
            expect(SANKEY).toMatch(
                /fill=\{`url\(#\$\{gradientId\}\)`\}/,
            );
        });

        it('no hardcoded hex colour palette per kind', () => {
            // The Epic 47.3 KIND_COLOR record carried five hex
            // values. R21 PR-B replaces it with KIND_SERIES indices.
            // Stripping comments so the doc-block's historical
            // reference to the old palette doesn't count.
            const stripped = SANKEY.replace(/\/\*[\s\S]*?\*\//g, '')
                .replace(/\/\/[^\n]*/g, '');
            expect(stripped).not.toMatch(/KIND_COLOR/);
            // Specifically — no inline hex palette in the render
            // path. (KIND_LABEL is fine; it's text.)
            expect(stripped).not.toMatch(
                /asset:\s*['"]#fcd34d['"]/,
            );
        });
    });

    describe('R21-PR-A ChartLegend replaces the inline column header', () => {
        it('renders <ChartLegend variant="series">', () => {
            expect(SANKEY).toMatch(/<ChartLegend/);
            expect(SANKEY).toMatch(/variant="series"/);
        });

        it('legend swatches use the same KIND_SERIES indices as the nodes', () => {
            expect(SANKEY).toMatch(
                /name:\s*KIND_LABEL\[kind\][\s\S]*?index:\s*KIND_SERIES\[kind\]/,
            );
        });
    });

    describe('click-isolate state + ESC unpin', () => {
        it('carries a pinnedId state separate from hoveredId', () => {
            expect(SANKEY).toMatch(/useState<string \| null>\(null\)/);
            expect(SANKEY).toMatch(/pinnedId/);
            expect(SANKEY).toMatch(/hoveredId/);
            expect(SANKEY).toMatch(/activeId\s*=\s*hoveredId\s*\?\?\s*pinnedId/);
        });

        it('clicking a node toggles its pinnedId', () => {
            expect(SANKEY).toMatch(/setPinnedId\(\(prev\)\s*=>\s*\(prev === nodeId \? null : nodeId\)\)/);
        });

        it('ESC key unpins via the shared useKeyboardShortcut registry', () => {
            // Wired through the canonical shortcut hook (the
            // project's keyboard-shortcut-conventions guardrail
            // bans raw window.addEventListener bindings).
            expect(SANKEY).toMatch(/useKeyboardShortcut/);
            expect(SANKEY).toMatch(/['"]Escape['"]/);
            expect(SANKEY).toMatch(/setPinnedId\(null\)/);
        });

        it('clicking the empty SVG canvas unpins', () => {
            // The Epic 47.3 hover-only behaviour leaves no way to
            // dismiss a sticky highlight. PR-B adds the
            // empty-canvas-click escape hatch.
            expect(SANKEY).toMatch(
                /e\.target\s*===\s*e\.currentTarget/,
            );
        });

        it('emits data-sankey-pinned-id for E2E hooks', () => {
            expect(SANKEY).toMatch(/data-sankey-pinned-id/);
        });
    });

    describe('Hover-pop + inline value annotation', () => {
        it('highlighted links thicken via strokeWidth × 1.5', () => {
            expect(SANKEY).toMatch(/isHighlighted\s*\?\s*link\.strokeWidth\s*\*\s*1\.5/);
        });

        it('inline weight annotation renders next to the label', () => {
            // The Epic 47.3 weight only surfaced in a <title>
            // tooltip. PR-B promotes it to a visible tabular-nums
            // count next to the label.
            expect(SANKEY).toMatch(/font-mono tabular-nums/);
            expect(SANKEY).toMatch(/\{node\.weight\}/);
        });
    });
});
