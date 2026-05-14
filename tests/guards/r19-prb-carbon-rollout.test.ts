/**
 * R19-PR-B — liquid-carbon rollout to secondary + destructive.
 *
 * R19-PR-A wired the carbon surface inline on `primary`. PR-B:
 *   1. Extracts the carbon classes into a shared `carbonSurface`
 *      recipe const — one source of truth, no per-variant
 *      duplication.
 *   2. Rolls the recipe to `secondary` + `destructive` — every
 *      solid-background button is now liquid carbon.
 *
 * `ghost` + `destructive-outline` are deliberately untouched —
 * they paint `bg-transparent`, and a depth-overlay over
 * transparent has no surface to pool light on. R19-PR-C gives
 * them a carbon-on-hover treatment.
 *
 * Five load-bearing invariants:
 *
 *   1. A module-level `carbonSurface` const exists, carrying the
 *      four recipe classes (border + bevel + before-scaffold +
 *      before-overlay). The recipe is colour-agnostic — it lives
 *      OUTSIDE the cva variants so every variant references one
 *      copy.
 *
 *   2. `primary` consumes the recipe via `...carbonSurface` — the
 *      PR-A inline block is gone, replaced by the spread.
 *
 *   3. `secondary` consumes the recipe via `...carbonSurface`.
 *
 *   4. `destructive` consumes the recipe via `...carbonSurface`.
 *
 *   5. `ghost` + `destructive-outline` do NOT consume the recipe
 *      — they stay `bg-transparent` (PR-C territory). A carbon
 *      overlay on a transparent button would pool light on
 *      nothing.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const VARIANTS = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/button-variants.ts'),
    'utf8',
);

/** Slice a single variant's class array out of the cva config. */
function variantBlock(name: string): string {
    // `secondary:` etc. — match the `name: [ ... ]` array. The
    // quoted form (`"destructive-outline":`) needs the optional
    // quote.
    const re = new RegExp(`["']?${name}["']?:\\s*\\[([\\s\\S]*?)\\],`);
    return VARIANTS.match(re)?.[1] ?? '';
}

describe('R19-PR-B — liquid-carbon rollout', () => {
    it('a shared `carbonSurface` recipe const carries the four recipe classes', () => {
        const recipe =
            VARIANTS.match(/const\s+carbonSurface\s*=\s*\[([\s\S]*?)\];/)?.[1] ??
            '';
        expect(recipe).toMatch(/border-\[var\(--btn-carbon-border\)\]/);
        expect(recipe).toMatch(/shadow-\[var\(--btn-carbon-bevel\)\]/);
        expect(recipe).toMatch(/before:content-\[''\]/);
        expect(recipe).toMatch(/before:bg-\[image:var\(--btn-carbon-overlay\)\]/);
        // The recipe is module-level — declared BEFORE the cva()
        // call, not inside a variant.
        expect(VARIANTS).toMatch(
            /const\s+carbonSurface\s*=\s*\[[\s\S]*?\];\s*[\s\S]*?export\s+const\s+buttonVariants\s*=\s*cva\(/,
        );
    });

    it('`primary` consumes the shared recipe (PR-A inline block replaced)', () => {
        expect(variantBlock('primary')).toMatch(/\.\.\.carbonSurface/);
    });

    it('`secondary` consumes the shared recipe', () => {
        expect(variantBlock('secondary')).toMatch(/\.\.\.carbonSurface/);
    });

    it('`destructive` consumes the shared recipe', () => {
        expect(variantBlock('destructive')).toMatch(/\.\.\.carbonSurface/);
    });

    it('`ghost` + `destructive-outline` do NOT take the recipe (transparent — PR-C territory)', () => {
        // A depth-overlay over `bg-transparent` pools light on
        // nothing. These two stay un-carboned until PR-C's
        // carbon-on-hover treatment.
        expect(variantBlock('ghost')).not.toMatch(/\.\.\.carbonSurface/);
        expect(variantBlock('ghost')).toMatch(/bg-transparent/);
        expect(variantBlock('destructive-outline')).not.toMatch(
            /\.\.\.carbonSurface/,
        );
        expect(variantBlock('destructive-outline')).toMatch(/bg-transparent/);
    });
});
