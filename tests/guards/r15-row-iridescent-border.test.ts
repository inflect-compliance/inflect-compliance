/**
 * Roadmap-15 PR-6 — Iridescent gradient border on hover.
 *
 * The band gives the row a state signal on its left edge. The
 * R13-PR6 gloss highlights the top edge. The R13-PR7 bevel
 * shadow gives the bottom edge a sense of concavity. But the row
 * has no FULL-PERIMETER signal — the eye sees the row's outline
 * only at hover via the inset bevel, which is muted by design.
 *
 * R15-PR6 adds a thin (1px), animated, hover-only OUTLINE that
 * traces the row's full perimeter at `outline-offset: -1px`
 * (acting as an inset border without shifting the row's content
 * by even a pixel). The outline-color CYCLES through three brand
 * tones over a 3-second ease-in-out loop:
 *
 *   --brand-default            (primary brand)
 *   --brand-secondary-default  (navy)
 *   --brand-emphasis           (primary brand, deeper)
 *   → back to --brand-default
 *
 * The eye reads colour-shifting on a thin line as polished
 * iridescence — like brushed-steel jewellery catching the light
 * at different angles. Three stops (not two) give a true
 * polychromatic shift rather than a back-and-forth pendulum
 * between two colours.
 *
 * Channel + property orthogonality:
 *
 *   - `outline` is a SEPARATE CSS property from `box-shadow`.
 *     The R13-PR7 bevel uses box-shadow; the R15-PR6 iridescence
 *     uses outline. They compose cleanly — no fighting over the
 *     same declared value, no order-sensitivity at the cascade.
 *
 *   - `outline-offset: -1px` puts the outline 1px INSIDE the
 *     row's outer edge. Without the negative offset, the outline
 *     would extend OUTSIDE rounded corners and look ugly against
 *     the sidebar's edge. -1px nestles it just inside.
 *
 *   - The focus-visible state's `outline-none` (NAV_ITEM_BASE)
 *     wins when focus AND hover are both active — Tailwind's
 *     variant emission puts `:focus-visible` after `:hover` in
 *     the cascade, so the focus ring is the dominant signal for
 *     keyboard users. Pointer-hover users get the iridescent
 *     border.
 *
 *   - The active state intentionally does NOT carry the
 *     iridescent border. The active row already signals "this is
 *     where you are" via brand-coloured text + navy band + radial
 *     wash + starburst. Adding a perpetual iridescent border
 *     would over-load the signal.
 *
 * What this ratchet does NOT police:
 *
 *   - The exact tempo (3s). Future tuning within 2–4s reads as
 *     the same intent.
 *   - The exact three colour stops, beyond "brand palette family".
 *     A future shift to add a fourth stop or replace `--brand-
 *     emphasis` with a different brand tier is a conscious
 *     vocabulary change that should update this ratchet too.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NAV_ITEM_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/nav-item.tsx'),
    'utf8',
);
const TAILWIND_CONFIG = fs.readFileSync(
    path.join(ROOT, 'tailwind.config.js'),
    'utf8',
);

describe('Roadmap-15 PR-6 — iridescent gradient border on hover', () => {
    describe('keyframe declaration', () => {
        it('declares `nav-row-iridescent` in tailwind.config.js keyframes', () => {
            expect(TAILWIND_CONFIG).toMatch(
                /'nav-row-iridescent':\s*\{/,
            );
        });

        /**
         * Slice the `nav-row-iridescent` keyframe out of the
         * tailwind.config.js source. Bounded by the next `'nav-`
         * sibling key — keeps the assertion's negative checks
         * from bleeding into a later keyframe.
         */
        function iridescentKeyframeSlice(): string {
            const declStart = TAILWIND_CONFIG.indexOf(
                "'nav-row-iridescent': {",
            );
            if (declStart < 0) return '';
            const tail = TAILWIND_CONFIG.slice(declStart);
            const ownKeyEnd = "'nav-row-iridescent': {".length;
            const afterOwn = tail.slice(ownKeyEnd);
            const nextNavOffset = afterOwn.indexOf("'nav-");
            if (nextNavOffset < 0) {
                const animKeyIdx = tail.indexOf('animation:');
                return animKeyIdx < 0 ? tail.slice(0, 800) : tail.slice(0, animKeyIdx);
            }
            return tail.slice(0, ownKeyEnd + nextNavOffset);
        }

        it('animates `outline-color` (separate property from box-shadow)', () => {
            // Outline is the seventh motion channel. The R15 motion
            // language now spans seven orthogonal CSS properties:
            //   opacity, transform, background-position, filter,
            //   clip-path, box-shadow, outline-color
            //
            // Match every stop's property name inside the keyframe
            // block — each must be `outline-color`, no other.
            // Slicing-then-grepping is fragile because subsequent
            // keyframes' COMMENTS mention the banned properties;
            // assertion-per-stop is the robust shape.
            const slice = iridescentKeyframeSlice();
            expect(slice.length).toBeGreaterThan(0);
            const propertyMatches =
                slice.match(/'(\w[\w-]*)':\s*'[^']+'/g) ?? [];
            // Filter out the outer `'nav-row-iridescent':` key
            // match itself — only stop-level property bindings
            // matter here.
            const stopProperties = propertyMatches.filter(
                (m) => !m.startsWith("'nav-"),
            );
            expect(stopProperties.length).toBeGreaterThanOrEqual(3);
            for (const stop of stopProperties) {
                expect(stop).toMatch(/^'outline-color':/);
            }
        });

        it('cycles through THREE brand palette stops', () => {
            // Three stops give a polychromatic iridescent shift.
            // Two stops would be a pendulum (A → B → A); the eye
            // reads two-stop oscillation as deliberate / mechanical.
            // Three stops with the loop returning to the start
            // colour is the canonical iridescent shape.
            const slice = iridescentKeyframeSlice();
            // 0%/100% — primary brand.
            expect(slice).toMatch(
                /'0%,\s*100%':\s*\{\s*'outline-color':\s*'var\(--brand-default\)'/,
            );
            // 33% — secondary brand (navy).
            expect(slice).toMatch(
                /'33%':\s*\{\s*'outline-color':\s*'var\(--brand-secondary-default\)'/,
            );
            // 66% — brand-emphasis (primary brand, deeper).
            expect(slice).toMatch(
                /'66%':\s*\{\s*'outline-color':\s*'var\(--brand-emphasis\)'/,
            );
        });

        it('returns to the start colour at 100% (palindrome shape)', () => {
            // 0% / 100% sharing the same colour is what makes the
            // infinite loop seamless — no hard jump at the seam.
            const slice = iridescentKeyframeSlice();
            expect(slice).toMatch(
                /'0%,\s*100%':\s*\{\s*'outline-color':\s*'var\(--brand-default\)'/,
            );
        });
    });

    describe('animation entry', () => {
        it('wires `animation.nav-row-iridescent` with 3s ease-in-out infinite', () => {
            // 3s — slow enough to read as a deliberate iridescence,
            // not a hyper-flicker. ease-in-out smooths colour
            // transitions. `infinite` keeps the colour shifting as
            // long as the row is hovered.
            expect(TAILWIND_CONFIG).toMatch(
                /'nav-row-iridescent':\s*'nav-row-iridescent\s+3s\s+ease-in-out\s+infinite'/,
            );
        });
    });

    describe('NavItem default-state wiring', () => {
        const defaultRecipe =
            NAV_ITEM_SRC.match(
                /export\s+const\s+NAV_ITEM_DEFAULT\s*=\s*['"]([^'"]+)['"]/,
            )?.[1] ?? '';

        it('hover applies an outline as the visual border', () => {
            // `hover:outline` engages outline-style: auto (or
            // solid via Tailwind's default). The hairline width
            // is set by `hover:outline-1`.
            expect(defaultRecipe).toMatch(/\bhover:outline\b/);
            expect(defaultRecipe).toMatch(/\bhover:outline-1\b/);
        });

        it('outline is offset INSIDE the row (-1px) so content does not shift', () => {
            // Without -1px offset the outline would sit OUTSIDE
            // the row's footprint and clash with the rounded-lg
            // radius at the sidebar's edge. Negative offset nests
            // the outline 1px inside the row's outer edge — acts
            // as an inset border that doesn't disturb layout.
            // No trailing `\b` — after `]` the next char is a space,
            // and both `]` and ` ` are non-word characters, so the
            // word boundary fails to match. The bracketed-value
            // syntax already disambiguates the token.
            expect(defaultRecipe).toMatch(
                /\bhover:outline-offset-\[-1px\]/,
            );
        });

        it('outline-color resolves to the brand-default token at rest', () => {
            // The static hover colour is brand-default. The
            // animation overrides it through three stops during
            // playback. When animation pauses or ends, the static
            // value resumes — there should never be an
            // un-coloured outline visible.
            expect(defaultRecipe).toMatch(
                /\bhover:outline-\[var\(--brand-default\)\]/,
            );
        });

        it('hover triggers the iridescent animation utility', () => {
            // `hover:animate-nav-row-iridescent` engages the
            // colour-cycle on hover only. Without this, the
            // outline would be a single static colour — visually
            // dead.
            //
            // R15-PR7 introduced the composed `nav-row-hover-
            // alive` utility that chains the iridescent cycle and
            // the one-shot liquid sweep into a single animation
            // class. Both forms preserve the iridescent contract —
            // the composed entry embeds `nav-row-iridescent 3s
            // ease-in-out infinite` as its first track.
            const iridescentForm =
                /\bhover:animate-nav-row-iridescent\b/.test(defaultRecipe);
            const composedForm =
                /\bhover:animate-nav-row-hover-alive\b/.test(defaultRecipe);
            expect(iridescentForm || composedForm).toBe(true);
        });
    });

    describe('NavItem active state', () => {
        const activeRecipe =
            NAV_ITEM_SRC.match(
                /export\s+const\s+NAV_ITEM_ACTIVE\s*=\s*['"]([^'"]+)['"]/,
            )?.[1] ?? '';

        it('active row does NOT carry the iridescent border', () => {
            // The active row already signals "this is where you are"
            // via brand-coloured text + navy band + radial wash +
            // starburst bloom. Adding a perpetual iridescent border
            // would over-load that signal. Iridescence is reserved
            // for the hover/discovery moment, not the settled
            // "you are here" state.
            expect(activeRecipe).not.toMatch(/animate-nav-row-iridescent/);
        });
    });
});
