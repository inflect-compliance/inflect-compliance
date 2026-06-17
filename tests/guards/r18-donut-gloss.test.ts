/**
 * R18-PR4 — Donut gloss sheen.
 *
 * First consumer of the R18-PR1 `<ChartGloss>` primitive. The
 * DonutChart now paints the two-layer paint: each segment's
 * colour gradient PLUS a gloss overlay (same `d`, white→
 * transparent ramp) so the ring reads as glass catching light.
 *
 * Five load-bearing invariants:
 *
 *   1. ONE shared `<ChartGloss>` def for the whole donut — every
 *      segment is on the same ring under the same light source,
 *      so they share one vertical sheen. (Contrast: the colour
 *      gradients are PER-series; the gloss is per-DONUT.)
 *
 *   2. The gloss def is `vertical` direction — light from above,
 *      the natural read for a ring lying flat on the card.
 *
 *   3. Each segment renders a SECOND `<path>` with the SAME `d`
 *      as its colour path, filled with `url(#<glossId>)`. Two
 *      paths, same `d`, stacked — the chart-gloss.tsx contract.
 *
 *   4. The gloss overlay is INERT to the pointer. As of the
 *      hover-tremble fix the whole visual group (colour + gloss +
 *      sheen) carries `pointer-events: none`; a SEPARATE stable hit
 *      path owns the hover. Without that inertness the moving
 *      (popped) geometry would steal — and oscillate — the hover.
 *
 *   5. The visual group is `aria-hidden` — it carries no data, only
 *      light + colour. The hit path's `<title>` + `aria-label` name
 *      the segment for assistive tech.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/DonutChart.tsx'),
    'utf8',
);

describe('R18-PR4 — Donut gloss sheen', () => {
    it('imports ChartGloss + chartGlossId from the chart-gloss primitive', () => {
        // R18-PR10 widened this import to also pull in
        // ChartSheenSweep + chartSheenId — assert the two
        // gloss names are present in a chart-gloss import,
        // not the exact whole-import shape.
        expect(SRC).toMatch(
            /import\s*\{[^}]*\bChartGloss\b[^}]*\}\s*from\s*['"]@\/components\/ui\/charts\/chart-gloss['"]/,
        );
        expect(SRC).toMatch(
            /import\s*\{[^}]*\bchartGlossId\b[^}]*\}\s*from\s*['"]@\/components\/ui\/charts\/chart-gloss['"]/,
        );
    });

    it('renders ONE shared <ChartGloss> def (per-donut, not per-series)', () => {
        // Exactly one <ChartGloss> JSX element in the file. The
        // colour gradients are per-series (a .map); the gloss is
        // one shared def. Match the element-with-`id`-prop form
        // so a docstring mention doesn't count.
        const matches = SRC.match(/<ChartGloss\s+id=/g);
        expect(matches).not.toBeNull();
        expect(matches!.length).toBe(1);
        // Not inside a .map() — it's a single def with the
        // donut-level glossId.
        expect(SRC).toMatch(
            /<ChartGloss\s+id=\{chartGlossId\(chartId\)\}/,
        );
    });

    it('the gloss def is vertical (light from above)', () => {
        expect(SRC).toMatch(
            /<ChartGloss[\s\S]*?direction="vertical"/,
        );
    });

    it('each segment paints a gloss overlay layer filled with the gloss def', () => {
        // The two-layer paint: a second segment layer filled with
        // url(#<glossId>). R18-PR11 converted the donut layers
        // from `<path d={path}>` to `<motion.path animate={{ d }}>`
        // for the data-change morph — so the gloss overlay is now
        // a `<motion.path>`. What's locked is the gloss FILL on a
        // segment layer, not the element name.
        expect(SRC).toMatch(
            /fill=\{`url\(#\$\{chartGlossId\(chartId\)\}\)`\}/,
        );
    });

    it('the visual group (colour+gloss+sheen) is pointerEvents=none + aria-hidden', () => {
        // Hover-tremble fix: the popped visual group is inert to the
        // pointer (so the moving geometry can't steal/oscillate the
        // hover) and aria-hidden (it carries light, not data). The
        // group-level inertness covers every layer inside it,
        // including the gloss overlay.
        expect(SRC).toMatch(
            /transform=\{popTransform\}\s*\n?\s*pointerEvents="none"\s*\n?\s*aria-hidden="true"/,
        );
    });
});
