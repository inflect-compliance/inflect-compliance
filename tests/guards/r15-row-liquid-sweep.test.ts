/**
 * Roadmap-15 PR-7 — Liquid background sweep on hover.
 *
 * The R12/R13/R15-1..6 vocabulary signals state with three surface
 * tokens — band, gloss highlight, bevel shadow — and one perimeter
 * token (the R15-PR6 iridescent outline). The row's INTERIOR
 * surface stays untouched on hover; only the active state's radial
 * brand wash paints inside the row's body.
 *
 * R15-PR7 adds a moment of light to the hover INTERIOR: a one-shot
 * diagonal sweep of brand-tinted gradient panning across the row's
 * background as the pointer arrives. The eye reads it as light
 * catching a polished surface — the "lickable" / "irresistibly
 * sexy" intent from the roadmap brief.
 *
 * Mechanism:
 *
 *   - The hover sets `background-image: linear-gradient(135deg,
 *     transparent 30%, var(--nav-row-liquid-tint) 50%, transparent
 *     70%)` — a narrow brand-tinted band centred at 50% of the
 *     gradient's width.
 *   - `background-size: 300% 100%` makes the gradient three times
 *     the row's width. The visible portion shows only ⅓ of the
 *     full gradient at a time.
 *   - The `nav-row-liquid-sweep` keyframe animates
 *     `background-position` from `-100% 0%` (gradient's bright
 *     centre off the row's left edge) to `100% 0%` (off the right
 *     edge) over 1.2 seconds ease-out. The bright band visibly
 *     sweeps left → right across the row.
 *   - The animation is ONE-SHOT — fires once when hover engages.
 *     A continuous sweep would read as a loading skeleton; once-
 *     per-engage reads as polish.
 *
 *   - The brand-tinted colour resolves through `--nav-row-liquid-
 *     tint`, theme-aware: METRO yellow at 14% / PwC orange at 16%.
 *     Slightly different alphas because the cream surface has
 *     lower contrast with brand orange than navy METRO has with
 *     brand yellow — alpha equalisation across themes.
 *
 *   - The animation utility consumed at the hover site is
 *     `nav-row-liquid-sweep` directly. The R15-PR6 iridescent
 *     border (and the composed `nav-row-hover-alive` chaining
 *     wrapper) was removed by user request — the row's hover
 *     vocabulary is now band + bevel + sweep, no perpetual
 *     outline cycle.
 *
 * What this ratchet does NOT police:
 *
 *   - The exact tint alpha values. Tuning within "muted enough to
 *     read as a wash" is allowed.
 *   - The exact sweep duration (1.2s). 1.0–1.5s sit in the same
 *     intent boundary.
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
const TOKENS_SRC = fs.readFileSync(
    path.join(ROOT, 'src/styles/tokens.css'),
    'utf8',
);
const DARK_BLOCK = TOKENS_SRC.match(/:root\s*\{[\s\S]*?\n\}/)![0];
const LIGHT_BLOCK = TOKENS_SRC.match(
    /\[data-theme="light"\]\s*\{[\s\S]*?\n\}/,
)![0];

describe('Roadmap-15 PR-7 — liquid bg sweep on hover', () => {
    describe('token wiring (--nav-row-liquid-tint)', () => {
        it('METRO declares --nav-row-liquid-tint with brand-yellow rgba', () => {
            // The dark theme uses brand yellow at low alpha.
            // `rgba(255, 205, 17, …)` is the canonical METRO
            // brand-yellow rgba — same RGB as `--brand-default`
            // (#FFCD11 = 255, 205, 17).
            expect(DARK_BLOCK).toMatch(
                /--nav-row-liquid-tint:\s*rgba\(255,\s*205,\s*17,\s*0\.\d+\)/,
            );
        });

        it('PwC declares --nav-row-liquid-tint with brand-orange rgba', () => {
            // The light theme uses brand orange at low alpha.
            // `rgba(208, 74, 2, …)` is the canonical PwC brand-
            // orange rgba — same RGB as `--brand-default` on the
            // light theme (#D04A02 = 208, 74, 2).
            expect(LIGHT_BLOCK).toMatch(
                /--nav-row-liquid-tint:\s*rgba\(208,\s*74,\s*2,\s*0\.\d+\)/,
            );
        });

        it('tint alpha is in the muted band (5–25%)', () => {
            // Too low and the sweep disappears; too high and the
            // brand colour dominates the row's interior. The 14–
            // 16% band is the sweet spot for both themes.
            const metroMatch = DARK_BLOCK.match(
                /--nav-row-liquid-tint:\s*rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/,
            );
            const pwcMatch = LIGHT_BLOCK.match(
                /--nav-row-liquid-tint:\s*rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/,
            );
            expect(metroMatch).not.toBeNull();
            expect(pwcMatch).not.toBeNull();
            const metroAlpha = parseFloat(metroMatch![1]);
            const pwcAlpha = parseFloat(pwcMatch![1]);
            expect(metroAlpha).toBeGreaterThan(0.05);
            expect(metroAlpha).toBeLessThan(0.25);
            expect(pwcAlpha).toBeGreaterThan(0.05);
            expect(pwcAlpha).toBeLessThan(0.25);
        });
    });

    describe('keyframe declaration', () => {
        it('declares `nav-row-liquid-sweep` in tailwind.config.js keyframes', () => {
            expect(TAILWIND_CONFIG).toMatch(
                /'nav-row-liquid-sweep':\s*\{/,
            );
        });

        it('animates `background-position` from -100% to 100%', () => {
            // The full pan from `-100% 0%` (bright centre off the
            // left edge of the row) to `100% 0%` (off the right
            // edge) is what makes the bright band visibly sweep
            // across the row's full width over the animation's
            // duration. A smaller pan range would leave the
            // bright band partially visible at both ends — looks
            // like a static highlight, not a sweep.
            const declStart = TAILWIND_CONFIG.indexOf(
                "'nav-row-liquid-sweep': {",
            );
            expect(declStart).toBeGreaterThan(-1);
            const tail = TAILWIND_CONFIG.slice(declStart);
            const animKeyIdx = tail.indexOf('animation:');
            const slice =
                animKeyIdx < 0
                    ? tail.slice(0, 800)
                    : tail.slice(0, animKeyIdx);
            expect(slice).toMatch(
                /'0%':\s*\{\s*'background-position':\s*'-100%\s+0%'/,
            );
            expect(slice).toMatch(
                /'100%':\s*\{\s*'background-position':\s*'100%\s+0%'/,
            );
        });
    });

    describe('animation entry', () => {
        // nav-row-sweep-delay-3s (2026-05-15) — duration extended
        // from 1.2s → 3.5s and easing changed from `ease-out` →
        // `linear` so the keyframe percentages map directly to
        // wall-clock time. Peak 1 fires at t=0, peak 2 lands at
        // t=3s (86% of 3.5s); ease-out would compress that
        // timing.
        it('wires `animation.nav-row-liquid-sweep` with 3.5s linear (one-shot)', () => {
            expect(TAILWIND_CONFIG).toMatch(
                /'nav-row-liquid-sweep':\s*'nav-row-liquid-sweep\s+3\.5s\s+linear'/,
            );
        });

        it('does NOT use `infinite` — sweep is one-shot only', () => {
            const entryMatch = TAILWIND_CONFIG.match(
                /'nav-row-liquid-sweep':\s*'nav-row-liquid-sweep\s+[^']+'/,
            );
            expect(entryMatch).not.toBeNull();
            expect(entryMatch![0]).not.toContain('infinite');
        });

        it('keyframes carry the two-peak structure with the transparent hold', () => {
            // The 11% / 74% / 86% intermediate stops are
            // load-bearing — they hold the bg in the transparent
            // zone between peaks, then sweep peak 2 through at
            // t=3s (86% of 3.5s). Removing any of them collapses
            // the animation back to a single sweep.
            const declStart = TAILWIND_CONFIG.indexOf(
                "'nav-row-liquid-sweep': {",
            );
            expect(declStart).toBeGreaterThan(-1);
            const tail = TAILWIND_CONFIG.slice(declStart);
            const animKeyIdx = tail.indexOf('animation:');
            const slice =
                animKeyIdx < 0
                    ? tail.slice(0, 1500)
                    : tail.slice(0, animKeyIdx);
            // 11% — peak 1 has exited.
            expect(slice).toMatch(
                /'11%':\s*\{\s*'background-position':\s*'-50%\s+0%'/,
            );
            // 74% — held at the same -50% position (transparent zone).
            expect(slice).toMatch(
                /'74%':\s*\{\s*'background-position':\s*'-50%\s+0%'/,
            );
            // 86% — peak 2 visible (bg at 50% shows tile 1's centre).
            // 86% × 3.5s ≈ 3.0s, the user-requested delay.
            expect(slice).toMatch(
                /'86%':\s*\{\s*'background-position':\s*'50%\s+0%'/,
            );
        });
    });

    describe('iridescent border + composed utility were removed', () => {
        it('no `nav-row-iridescent` keyframe or animation entry remains', () => {
            // The iridescent outline cycle was removed by user
            // request. Both the keyframe declaration and the
            // animation entry must be gone — leaving either as
            // dead code would silently re-enable the cycle if a
            // future PR re-introduces the consumer class.
            expect(TAILWIND_CONFIG).not.toContain('nav-row-iridescent');
        });

        it('no composed `nav-row-hover-alive` entry remains', () => {
            // The composed wrapper existed only to chain the
            // iridescent + sweep tracks. With the iridescent
            // track gone, the sweep is consumed directly via
            // `animate-nav-row-liquid-sweep`.
            expect(TAILWIND_CONFIG).not.toContain('nav-row-hover-alive');
        });
    });

    describe('NavItem default-state wiring', () => {
        const defaultRecipe =
            NAV_ITEM_SRC.match(
                /export\s+const\s+NAV_ITEM_DEFAULT\s*=\s*['"]([^'"]+)['"]/,
            )?.[1] ?? '';

        it('hover sets a linear-gradient bg with the brand tint at the centre', () => {
            // The hover paints the bg-image; the keyframe pans it.
            // Without the bg-image, there's nothing to sweep.
            expect(defaultRecipe).toMatch(
                /hover:bg-\[linear-gradient\(135deg,/,
            );
            expect(defaultRecipe).toMatch(/var\(--nav-row-liquid-tint\)/);
        });

        it('hover sets `background-size: 300% 100%` so the gradient can pan', () => {
            // Without 3x width, the gradient already covers the
            // row and `background-position` movement is a no-op.
            // The keyframe needs room to slide the bright band
            // across.
            expect(defaultRecipe).toMatch(
                /hover:\[background-size:300%_100%\]/,
            );
        });

        it('hover wires the `nav-row-liquid-sweep` animation directly', () => {
            // The composed `nav-row-hover-alive` wrapper was
            // removed alongside the iridescent border. The hover
            // animation now consumes the sweep keyframe directly.
            expect(defaultRecipe).toMatch(
                /\bhover:animate-nav-row-liquid-sweep\b/,
            );
        });

        it('hover does NOT carry outline-based affordances (iridescent removed)', () => {
            // The iridescent outline cycle was retired. No
            // `hover:outline*` classes should remain on the
            // default recipe — they'd paint a static outline
            // without the animation now.
            expect(defaultRecipe).not.toMatch(/\bhover:outline\b/);
            expect(defaultRecipe).not.toMatch(/\bhover:outline-/);
        });
    });

    describe('NavItem active state', () => {
        const activeRecipe =
            NAV_ITEM_SRC.match(
                /export\s+const\s+NAV_ITEM_ACTIVE\s*=\s*['"]([^'"]+)['"]/,
            )?.[1] ?? '';

        it('active row does NOT carry the liquid sweep', () => {
            // The active row's bg is the radial brand-secondary
            // wash (R13-PR11). Adding the liquid sweep on top
            // would compete for the row's interior surface.
            // Sweep is reserved for the hover/discovery moment.
            expect(activeRecipe).not.toMatch(/nav-row-liquid-sweep/);
        });
    });
});
