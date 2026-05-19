/**
 * Roadmap-13 PR-9 — Band reaches toward the cursor on hover.
 *
 * The user spec: "more fluid". R13-PR9 makes the band visibly grow
 * when the row is hovered or active — the capsule reaches toward
 * the cursor instead of holding its idle dimensions.
 *
 * Geometry transition:
 *
 *   IDLE       top-1.5 bottom-1.5 w-3px  (R12-PR5 lock; 6px inset, 3px wide)
 *   HOVER+ACT  top-1   bottom-1   w-4px  (R13-PR9; 4px inset, 4px wide)
 *
 * 2px of vertical extension + 1px of width. Subtle on its own,
 * load-bearing when combined with the opacity reveal — the band
 * feels like it's been WAITING for you, leaning in as your cursor
 * approaches.
 *
 * Animated via the broadened transition-property list
 * (`before:transition-[opacity,top,bottom,width]` in NAV_ITEM_BAND_BASE).
 * Single 200ms ease-out shared with the opacity reveal — geometry
 * + visibility arrive together in one choreographed beat.
 *
 * R12-PR5's geometry assertion still passes because:
 *   - BASE keeps `before:top-1.5 before:bottom-1.5 before:w-[3px]`
 *     (the idle geometry).
 *   - HOVER + ACTIVE override with `top-1 / bottom-1 / w-[4px]`
 *     (with `!` important on ACTIVE for unambiguous precedence).
 *   - The R12-PR5 ratchet's regex matches the BASE values, which
 *     are still present.
 *
 * The motion-language ratchet (`motion-language-discipline.test.ts`)
 * does NOT object: the banned patterns are `hover:translate-*`,
 * `hover:scale-*`, `hover:shadow-*` — not `hover:top-*` or
 * `hover:w-*`. Geometry-via-positioning is a different beast than
 * decorative transform-lift.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NAV_ITEM_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/nav-item.tsx'),
    'utf8',
);

function defaultRecipe(): string {
    return (
        NAV_ITEM_SRC.match(
            /export\s+const\s+NAV_ITEM_DEFAULT\s*=\s*['"]([^'"]+)['"]/,
        )?.[1] ?? ''
    );
}

function activeRecipe(): string {
    return (
        NAV_ITEM_SRC.match(
            /export\s+const\s+NAV_ITEM_ACTIVE\s*=\s*['"]([^'"]+)['"]/,
        )?.[1] ?? ''
    );
}

describe('Roadmap-13 PR-9 — band reaches toward the cursor', () => {
    describe('NAV_ITEM_BAND_BASE preserves R12-PR5 idle geometry', () => {
        it('still declares top-1.5 / bottom-1.5 / w-[3px]', () => {
            // The idle dimensions stay locked. R13-PR9 ADDS the
            // hover/active overrides; it does not change idle.
            // Without the idle baseline, the transition has
            // nothing to interpolate from.
            const baseRegion =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_BAND_BASE\s*=\s*\[[\s\S]+?\]\.join\(/,
                )?.[0] ?? '';
            expect(baseRegion).toMatch(/before:top-1\.5\b/);
            expect(baseRegion).toMatch(/before:bottom-1\.5\b/);
            expect(baseRegion).toMatch(/before:w-\[3px\]/);
        });

        it('expands the transition-property list to include geometry', () => {
            // The transition was `transition-opacity` in R12-PR5.
            // R13-PR9 broadens to `transition-[opacity,top,bottom,
            // width]` — same single 200ms ease-out applies to all
            // four properties. Single duration keeps the band's
            // reveal + reach feeling like one piece of motion.
            const baseRegion =
                NAV_ITEM_SRC.match(
                    /const\s+NAV_ITEM_BAND_BASE\s*=\s*\[[\s\S]+?\]\.join\(/,
                )?.[0] ?? '';
            expect(baseRegion).toMatch(
                /before:transition-\[opacity,top,bottom,width\]/,
            );
            // Duration preserved verbatim from R12-PR5.
            expect(baseRegion).toMatch(/before:duration-200/);
        });
    });

    describe('NAV_ITEM_DEFAULT — band is no longer revealed on hover (2026-05-19)', () => {
        it('does NOT override band geometry on hover (band is active-only now)', () => {
            // R13-PR9 originally made the band "reach toward the
            // cursor" by expanding the `::before` geometry on hover.
            // 2026-05-19 retired the entire hover-band reveal at the
            // user's request — these classes must NOT appear in the
            // default recipe. The reach behaviour is preserved
            // unconditionally on ACTIVE rows (locked below).
            const recipe = defaultRecipe();
            expect(recipe).not.toMatch(/hover:before:top-1\b/);
            expect(recipe).not.toMatch(/hover:before:bottom-1\b/);
            expect(recipe).not.toMatch(/hover:before:w-\[4px\]/);
        });

        it('hover NEVER uses translate / scale (R12 motion contract)', () => {
            // The band reach is achieved via position + width
            // changes, NOT via `hover:translate-` or `hover:scale-`.
            // The motion-language-discipline ratchet still bans
            // those product-wide; we double-up the contract here.
            const recipe = defaultRecipe();
            expect(recipe).not.toMatch(/\bhover:translate-/);
            expect(recipe).not.toMatch(/\bhover:scale-/);
        });
    });

    describe('NAV_ITEM_ACTIVE holds the reach geometry unconditionally', () => {
        it('overrides band geometry with `!` important', () => {
            // Active rows reach permanently. The `!` is required
            // because BASE's idle `top-1.5 / bottom-1.5 / w-[3px]`
            // and ACTIVE's `top-1 / bottom-1 / w-[4px]` are
            // siblings at the same specificity — `!` is the only
            // unambiguous way to win.
            const recipe = activeRecipe();
            expect(recipe).toMatch(/before:top-1!/);
            expect(recipe).toMatch(/before:bottom-1!/);
            expect(recipe).toMatch(/before:w-\[4px\]!/);
        });

        it('active band geometry does NOT also include the idle values', () => {
            // A regression that adds BOTH `before:top-1.5` AND
            // `before:top-1!` to the active recipe would emit
            // both declarations in CSS and rely on `!` to resolve.
            // Cleaner is to only emit the reach values; lock the
            // absence of the idle ones in the active state.
            const recipe = activeRecipe();
            expect(recipe).not.toMatch(/\bbefore:top-1\.5/);
            expect(recipe).not.toMatch(/\bbefore:bottom-1\.5/);
            expect(recipe).not.toMatch(/\bbefore:w-\[3px\]/);
        });
    });
});
