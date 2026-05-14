/**
 * R19-PR-A — liquid-carbon button surface.
 *
 * First PR of Roadmap-19 (Carbon Buttons I — Surface & Structure).
 * Buttons stop reading as flat painted rectangles and become deep,
 * voluminous pools of LIQUID CARBON — wet-looking, dark, restrained
 * (never a hard mirror shine).
 *
 * Ships three things:
 *   1. Three `--btn-carbon-*` tokens in tokens.css (both themes).
 *   2. The carbon-surface scaffolding (`relative`) in the
 *      `buttonVariants` cva BASE.
 *   3. The full carbon treatment on the `primary` variant —
 *      border + bevel + a `::before` depth-overlay.
 *
 * Eight load-bearing invariants:
 *
 *   1. All three tokens are defined in BOTH theme blocks of
 *      tokens.css (dark + light) — a carbon button must work in
 *      both.
 *
 *   2. The dark + light `--btn-carbon-overlay` values DIFFER —
 *      a liquid pool needs theme-tuned stops (the light theme
 *      needs a deeper bottom pool to register).
 *
 *   3. `--btn-carbon-overlay` is a `radial-gradient`, NOT a flat
 *      `linear-gradient` top-down ramp. The radial light POOL is
 *      what reads as "liquid" — light gathering on a curved wet
 *      surface rather than washing the whole face. This is the
 *      LIQUID in liquid-carbon; locked so a future "simplify"
 *      can't flatten it back to a ramp.
 *
 *   4. `--btn-carbon-bevel` is an INSET-led box-shadow (volume
 *      from within), not just an outer drop.
 *
 *   5. `relative` is in the cva BASE — the positioning context
 *      every variant's `::before` overlay needs. In the base,
 *      not per-variant, so future variants inherit it.
 *
 *   6. The `primary` variant carries the carbon border + bevel,
 *      token-backed (no hex literals).
 *
 *   7. The `primary` variant paints a `::before` depth-overlay:
 *      `content-['']` + `absolute inset-0` + `rounded-[inherit]`
 *      (tracks the button shape) + `pointer-events-none` (never
 *      intercepts a click).
 *
 *   8. The `::before` is filled with the carbon overlay via
 *      `before:bg-[image:var(--btn-carbon-overlay)]`.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const TOKENS = fs.readFileSync(
    path.join(ROOT, 'src/styles/tokens.css'),
    'utf8',
);
const VARIANTS = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button-variants.ts'),
    'utf8',
);

describe('R19-PR-A — liquid-carbon button surface', () => {
    describe('tokens (tokens.css)', () => {
        it('all three --btn-carbon-* tokens are defined in BOTH theme blocks', () => {
            for (const token of [
                '--btn-carbon-overlay',
                '--btn-carbon-bevel',
                '--btn-carbon-border',
            ]) {
                const matches = TOKENS.match(
                    new RegExp(`${token}:`, 'g'),
                );
                expect(matches).not.toBeNull();
                // One in the dark (default) block, one in light.
                expect(matches!.length).toBe(2);
            }
        });

        it('the dark + light --btn-carbon-overlay values differ (theme-tuned)', () => {
            const values = [
                ...TOKENS.matchAll(/--btn-carbon-overlay:\s*([^;]+);/g),
            ].map((m) => m[1].trim());
            expect(values.length).toBe(2);
            expect(values[0]).not.toBe(values[1]);
        });

        it('--btn-carbon-overlay is a radial-gradient POOL, not a flat ramp', () => {
            // The LIQUID in liquid-carbon: light gathers in a
            // soft elliptical pool, not a top-down linear wash.
            const values = [
                ...TOKENS.matchAll(/--btn-carbon-overlay:\s*([^;]+);/g),
            ].map((m) => m[1].trim());
            for (const v of values) {
                expect(v).toMatch(/^radial-gradient\(/);
                expect(v).not.toMatch(/linear-gradient/);
            }
        });

        it('--btn-carbon-bevel is inset-led (volume from within)', () => {
            const values = [
                ...TOKENS.matchAll(/--btn-carbon-bevel:\s*([^;]+);/g),
            ].map((m) => m[1].trim());
            expect(values.length).toBe(2);
            for (const v of values) {
                // The shadow list must LEAD with an `inset` —
                // the volume is read from within, not as a flat
                // outer drop.
                expect(v).toMatch(/^inset\s/);
            }
        });
    });

    describe('cva base (button-variants.ts)', () => {
        it('the cva BASE carries `relative` (the ::before positioning context)', () => {
            // Extract the base array — cva's first argument.
            const base = VARIANTS.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
            expect(base).toMatch(/["']relative["']/);
        });
    });

    describe('carbon surface recipe', () => {
        // R19-PR-B extracted the carbon classes PR-A wired inline
        // on `primary` into a shared `carbonSurface` const. These
        // assertions follow the recipe to its new home — and
        // assert `primary` still consumes it.
        it('the shared `carbonSurface` recipe carries the token-backed border + bevel (no hex literals)', () => {
            const recipe =
                VARIANTS.match(
                    /const\s+carbonSurface\s*=\s*\[([\s\S]*?)\];/,
                )?.[1] ?? '';
            expect(recipe).toMatch(/border-\[var\(--btn-carbon-border\)\]/);
            expect(recipe).toMatch(/shadow-\[var\(--btn-carbon-bevel\)\]/);
        });

        it('the recipe paints a ::before depth-overlay that tracks the button shape and never intercepts clicks', () => {
            const recipe =
                VARIANTS.match(
                    /const\s+carbonSurface\s*=\s*\[([\s\S]*?)\];/,
                )?.[1] ?? '';
            expect(recipe).toMatch(
                /before:content-\[''\][\s\S]*?before:absolute[\s\S]*?before:inset-0[\s\S]*?before:rounded-\[inherit\][\s\S]*?before:pointer-events-none/,
            );
        });

        it('the recipe fills the ::before with the carbon overlay token', () => {
            const recipe =
                VARIANTS.match(
                    /const\s+carbonSurface\s*=\s*\[([\s\S]*?)\];/,
                )?.[1] ?? '';
            // R19-PR-C stacked `--btn-carbon-grain` as the top
            // layer of the same `::before` background. The overlay
            // token is still there — just no longer the sole image
            // — so match it anywhere inside the `before:bg-[image:…]`
            // arbitrary value.
            expect(recipe).toMatch(
                /before:bg-\[image:[^\]]*var\(--btn-carbon-overlay\)/,
            );
        });

        it('the `primary` variant consumes the shared recipe', () => {
            expect(VARIANTS).toMatch(
                /primary:\s*\[[\s\S]*?\.\.\.carbonSurface/,
            );
        });
    });
});
