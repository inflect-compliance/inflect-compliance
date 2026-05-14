/**
 * R19-PR-C — carbon-on-hover for the transparent variants +
 * the micro-grain layer + density tuning.
 *
 * R19-PR-A/B carboned the three solid-fill variants. PR-C closes
 * the set:
 *   1. A `--btn-carbon-grain` token — a grayscale fractal-noise
 *      data-URI — stacked as the TOP layer of every carbon
 *      `::before` background (above the light pool, under the
 *      label). The tactility layer.
 *   2. A shared `carbonOnHover` recipe — the full carbon field
 *      (grain + pool `::before` + bevel) parked at `opacity-0`
 *      and lifted on hover. Rolled to `ghost` +
 *      `destructive-outline`, the two `bg-transparent` variants
 *      that had no surface to pool light on at rest.
 *   3. Density tuning — a whisper of negative `tracking` in the
 *      cva base.
 *
 * Eight load-bearing invariants:
 *
 *   1. `--btn-carbon-grain` is defined in tokens.css.
 *
 *   2. It is an SVG fractal-noise data-URI — NOT a flat colour
 *      or gradient. The grain is the point; a "simplify" PR
 *      can't quietly swap it for a solid tint.
 *
 *   3. `carbonSurface`'s `::before` stacks grain OVER overlay —
 *      a two-image `before:bg-[image:…]` with grain first.
 *
 *   4. A module-level `carbonOnHover` recipe const exists.
 *
 *   5. `carbonOnHover` parks the `::before` at `opacity-0` and
 *      lifts it with `hover:before:opacity-100` — carbon emerges
 *      on hover, not at rest.
 *
 *   6. `carbonOnHover` adds the bevel on hover
 *      (`hover:shadow-[var(--btn-carbon-bevel)]`) and does NOT
 *      touch the border — `ghost` stays borderless,
 *      `destructive-outline` keeps its red danger edge.
 *
 *   7. `ghost` + `destructive-outline` consume `...carbonOnHover`
 *      (and still NOT `...carbonSurface` — they have no rest-state
 *      surface).
 *
 *   8. The cva base carries the density-tuning negative tracking.
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

/** Slice a single variant's class array out of the cva config. */
function variantBlock(name: string): string {
    const re = new RegExp(`["']?${name}["']?:\\s*\\[([\\s\\S]*?)\\],`);
    return VARIANTS.match(re)?.[1] ?? '';
}

/** Slice a named module-level recipe const's array body. */
function recipeBlock(name: string): string {
    const re = new RegExp(`const\\s+${name}\\s*=\\s*\\[([\\s\\S]*?)\\];`);
    return VARIANTS.match(re)?.[1] ?? '';
}

describe('R19-PR-C — carbon-on-hover + micro-grain', () => {
    describe('the --btn-carbon-grain token', () => {
        it('is defined in tokens.css', () => {
            expect(TOKENS).toMatch(/--btn-carbon-grain:/);
        });

        it('is an SVG fractal-noise data-URI, not a flat tint', () => {
            const value =
                TOKENS.match(/--btn-carbon-grain:\s*([^;]+);/)?.[1].trim() ??
                '';
            expect(value).toMatch(/^url\(/);
            expect(value).toMatch(/data:image\/svg\+xml/);
            // The grain IS the noise — feTurbulence/fractalNoise
            // must survive. A flat colour or plain gradient fails.
            expect(value).toMatch(/feTurbulence/);
            expect(value).toMatch(/fractalNoise/);
        });
    });

    describe('carbonSurface — grain stacked over the light pool', () => {
        it("the `::before` background stacks grain OVER overlay", () => {
            const recipe = recipeBlock('carbonSurface');
            // Two-image background: grain first (top layer), the
            // light pool second (bottom layer).
            expect(recipe).toMatch(
                /before:bg-\[image:var\(--btn-carbon-grain\),var\(--btn-carbon-overlay\)\]/,
            );
        });
    });

    describe('carbonOnHover — the transparent-variant recipe', () => {
        it('exists as a module-level const', () => {
            expect(VARIANTS).toMatch(/const\s+carbonOnHover\s*=\s*\[/);
        });

        it('parks the `::before` at opacity-0 and lifts it on hover', () => {
            const recipe = recipeBlock('carbonOnHover');
            expect(recipe).toMatch(/before:opacity-0/);
            expect(recipe).toMatch(/hover:before:opacity-100/);
            // Same grain+pool `::before` as the solid recipe.
            expect(recipe).toMatch(
                /before:bg-\[image:var\(--btn-carbon-grain\),var\(--btn-carbon-overlay\)\]/,
            );
        });

        it('adds the bevel on hover and never touches the border', () => {
            const recipe = recipeBlock('carbonOnHover');
            expect(recipe).toMatch(
                /hover:shadow-\[var\(--btn-carbon-bevel\)\]/,
            );
            // The border is the variants' own identity — ghost
            // borderless, destructive-outline red. The recipe must
            // not carry ANY border class.
            expect(recipe).not.toMatch(/border-/);
        });
    });

    describe('rollout to the transparent variants', () => {
        it('`ghost` consumes `...carbonOnHover` (and not `...carbonSurface`)', () => {
            const block = variantBlock('ghost');
            expect(block).toMatch(/\.\.\.carbonOnHover/);
            expect(block).not.toMatch(/\.\.\.carbonSurface/);
            // Still transparent at rest — carbon is hover-only.
            expect(block).toMatch(/bg-transparent/);
        });

        it('`destructive-outline` consumes `...carbonOnHover` and keeps its red edge', () => {
            const block = variantBlock('destructive-outline');
            expect(block).toMatch(/\.\.\.carbonOnHover/);
            expect(block).not.toMatch(/\.\.\.carbonSurface/);
            expect(block).toMatch(/bg-transparent/);
            // The danger edge survives — PR-C adds depth, not an
            // outline swap.
            expect(block).toMatch(/border-border-error/);
        });
    });

    describe('density tuning', () => {
        it('the cva base carries the negative tracking', () => {
            const base =
                VARIANTS.match(/cva\(\s*\[([\s\S]*?)\]\s*,/)?.[1] ?? '';
            expect(base).toMatch(/tracking-\[-0\.01em\]/);
        });
    });
});
