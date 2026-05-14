/**
 * R18-PR11 — fluid data-change morphing.
 *
 * When the donut's `segments` prop changes — a risk count flips,
 * a status moves — the arc geometry should TWEEN smoothly to the
 * new shape instead of snapping. PR-11 converts the three stacked
 * donut `<path>` layers (colour + gloss + sheen) to
 * `<motion.path>` with an `animate={{ d }}` interpolation.
 *
 * Four load-bearing invariants:
 *
 *   1. The three segment layers are `<motion.path>`, not plain
 *      `<path>` — framer-motion's path interpolation is what
 *      tweens the `d` attribute. (The prior `transition-all
 *      duration-500` on the colour layer was a no-op — CSS can't
 *      reliably transition `d`.)
 *
 *   2. Each `<motion.path>` carries `initial={false}`. This is
 *      the load-bearing line: it means NO mount animation. The
 *      R18-PR5 bubble-entrance (the group `scale`) owns the
 *      mount; the `d` morph only fires on UPDATE. Without
 *      `initial={false}` every segment would animate its `d`
 *      from undefined on first paint — a flicker.
 *
 *   3. The morph is `animate={{ d: path }}` — the `path` is the
 *      visx-generated arc string; framer-motion interpolates
 *      between the old and new `d` on a data change.
 *
 *   4. The dead `transition-all duration-500` class is GONE from
 *      the colour layer — it never worked AND it violates the
 *      motion-language ratchet's ban on `transition-all`. PR-11
 *      replaces it with the real framer-motion morph.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/DonutChart.tsx'),
    'utf8',
);

describe('R18-PR11 — fluid data-change morphing', () => {
    it('the three segment layers are <motion.path>, not plain <path>', () => {
        // Three stacked layers per segment: colour + gloss +
        // sheen. All three must be motion.path for the `d` morph.
        // Match the JSX-element form (`<motion.path` followed by a
        // newline + the `initial=` prop) so the docstring's prose
        // mention of `<motion.path>` doesn't count.
        const motionPaths = SRC.match(/<motion\.path\s*\n\s*initial=/g);
        expect(motionPaths).not.toBeNull();
        expect(motionPaths!.length).toBe(3);
    });

    it('every segment motion.path carries initial={false} (no mount animation)', () => {
        // initial={false} — the bubble-entrance owns the mount;
        // the d-morph only fires on UPDATE. Three layers, three
        // initial={false}.
        const initialFalse = SRC.match(/initial=\{false\}/g);
        expect(initialFalse).not.toBeNull();
        expect(initialFalse!.length).toBe(3);
    });

    it('the morph target is animate={{ d: path }}', () => {
        const animateD = SRC.match(/animate=\{\{\s*d:\s*path\s*\}\}/g);
        expect(animateD).not.toBeNull();
        expect(animateD!.length).toBe(3);
    });

    it('the dead `transition-all duration-500` class is gone', () => {
        // It never morphed `d` (CSS can't) AND it violates the
        // motion-language ratchet's transition-all ban. PR-11
        // replaces it with the real framer-motion morph.
        //
        // Scope the check to an actual `className=` usage — the
        // PR-11 docstring legitimately MENTIONS the prior dead
        // class in prose to explain why it was removed.
        expect(SRC).not.toMatch(
            /className="[^"]*transition-all\s+duration-500/,
        );
    });
});
