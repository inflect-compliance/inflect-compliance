/**
 * Roadmap-13 PR-7 — Inset bevel shadow on hover.
 *
 * The user asked for buttons that feel "more inevitable" — that the
 * click is rewarded with a tactile sense of having pressed a real
 * surface. R13-PR6 added the top-edge highlight (the gloss); PR-7
 * completes the bevel by adding a subtle inset shadow at the bottom
 * edge. Top highlight + bottom shadow = the row reads as a slightly
 * recessed surface, which is what makes the click feel physical.
 *
 * Implementation: a single `inset` `box-shadow` on the row itself
 * (not on the pseudo-elements). The shadow is theme-aware via
 * `--nav-bevel-shadow`:
 *
 *   METRO  inset 0 -1px 1px 0 rgba(0, 0, 0, 0.25)
 *   PwC    inset 0 -1px 1px 0 rgba(60, 50, 40, 0.08)
 *
 * Both shadows have the same GEOMETRY (1px y-offset down, 1px blur,
 * 0 spread) — only the COLOUR + ALPHA tune for surface luminance.
 * On dark, a stronger black at 25%; on cream, a soft warm-neutral
 * at 8% (matches the warm-tinted shadow vocabulary of the light
 * theme).
 *
 * Applied on hover (NAV_ITEM_DEFAULT) and unconditionally on active
 * (NAV_ITEM_ACTIVE). Combined with the gloss `::after`, the row
 * acquires its raised-button feel without any geometry change.
 *
 * What this ratchet does NOT police:
 *   - The exact alpha. Tuning is allowed within the token.
 *   - The press-feedback (active:translate-y-px) — that's PR-8's
 *     job. The bevel is the static-state cue; the press is the
 *     transient cue. Two complementary pieces.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const NAV_ITEM_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/layout/nav-item.tsx'),
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

describe('Roadmap-13 PR-7 — inset bevel shadow on hover', () => {
    describe('--nav-bevel-shadow token (theme-aware)', () => {
        it('METRO declares --nav-bevel-shadow with black inset alpha', () => {
            // On dark navy, a black inset reads as a faint bottom-
            // edge darkening — the "tactile depth" cue.
            expect(DARK_BLOCK).toMatch(
                /--nav-bevel-shadow:\s*inset\s+0\s+-1px\s+1px\s+0\s+rgba\(0,\s*0,\s*0,\s*0\.25\)/,
            );
        });

        it('PwC declares --nav-bevel-shadow with warm-neutral inset', () => {
            // PwC's shadow vocabulary is warm-tinted (see `--shadow`).
            // The bevel matches: rgba(60, 50, 40, 0.08) — same hue as
            // the rest of the light theme's shadows, lower alpha
            // (cream is sensitive to dark inserts).
            expect(LIGHT_BLOCK).toMatch(
                /--nav-bevel-shadow:\s*inset\s+0\s+-1px\s+1px\s+0\s+rgba\(60,\s*50,\s*40,\s*0\.08\)/,
            );
        });

        it('both themes use the SAME geometry (inset 0 -1px 1px 0)', () => {
            // The shape of the bevel is theme-independent — only the
            // shadow's colour/alpha tunes for surface. A future PR
            // that bumps METRO to `-2px 2px 0` and PwC stays at
            // `-1px 1px 0` would create unbalanced bevels between
            // themes. Lock the geometry.
            for (const block of [DARK_BLOCK, LIGHT_BLOCK]) {
                expect(block).toMatch(
                    /--nav-bevel-shadow:\s*inset\s+0\s+-1px\s+1px\s+0/,
                );
            }
        });

        it('both shadows are `inset` (never outer drop)', () => {
            // The bevel MUST be inset — an outer drop shadow on
            // sidebar rows would conflict with the page's spatial
            // model (rows are flush with the sidebar, not floating
            // cards). A regression to a non-inset shadow would
            // visibly lift every row off the sidebar.
            for (const block of [DARK_BLOCK, LIGHT_BLOCK]) {
                const match = block.match(
                    /--nav-bevel-shadow:\s*([^;]+);/,
                )?.[1];
                expect(match).toBeDefined();
                expect(match!).toMatch(/^\s*inset\s+/);
            }
        });
    });

    describe('NAV_ITEM_DEFAULT applies the bevel on hover', () => {
        it('hover triggers `shadow-[var(--nav-bevel-shadow)]`', () => {
            const defaultRecipe =
                NAV_ITEM_SRC.match(
                    /export\s+const\s+NAV_ITEM_DEFAULT\s*=\s*['"]([^'"]+)['"]/,
                )?.[1] ?? '';
            expect(defaultRecipe).toMatch(
                /hover:shadow-\[var\(--nav-bevel-shadow\)\]/,
            );
        });

        it('hover does NOT reach for an outer drop shadow', () => {
            // The discipline is "inset only, applied via the
            // token". A naked `hover:shadow-md` or
            // `hover:shadow-lg` would paint an outer drop shadow
            // and visibly lift the row off the sidebar — wrong
            // spatial model.
            const defaultRecipe =
                NAV_ITEM_SRC.match(
                    /export\s+const\s+NAV_ITEM_DEFAULT\s*=\s*['"]([^'"]+)['"]/,
                )?.[1] ?? '';
            expect(defaultRecipe).not.toMatch(
                /hover:shadow-(sm|md|lg|xl)\b/,
            );
        });
    });

    describe('NAV_ITEM_ACTIVE holds the bevel unconditionally', () => {
        it('active includes the bevel-shadow token (single or stacked form)', () => {
            // R13-PR7 originally stamped `shadow-[var(--nav-bevel-
            // shadow)]` directly on the active recipe. R15-PR9
            // adds a SECOND outer shadow (brand-coloured aura) to
            // the same `shadow-[...]` value, producing a stacked
            // form like
            //   shadow-[0_0_12px_2px_var(--nav-row-aura-color),
            //           var(--nav-bevel-shadow)]
            // The bevel-shadow token is still inside the value,
            // just no longer the sole shadow. Accept both forms.
            const activeRecipe =
                NAV_ITEM_SRC.match(
                    /export\s+const\s+NAV_ITEM_ACTIVE\s*=\s*['"]([^'"]+)['"]/,
                )?.[1] ?? '';
            // The bevel-shadow var MUST appear inside a `shadow-[...]`
            // bracketed value on the active recipe, un-prefixed by
            // `hover:`. The bracket content may contain other
            // shadow layers separated by commas.
            const singleForm =
                /(?<!hover:)shadow-\[var\(--nav-bevel-shadow\)\]/.test(
                    activeRecipe,
                );
            const stackedForm =
                /(?<!hover:)shadow-\[[^\]]*var\(--nav-bevel-shadow\)[^\]]*\]/.test(
                    activeRecipe,
                );
            expect(singleForm || stackedForm).toBe(true);
        });

        it('active does NOT reach for an outer DEPTH shadow', () => {
            // The discipline is "no `shadow-md` / `shadow-lg` /
            // etc. — those are uniform black depth shadows that
            // would lift the row off the sidebar". R15-PR9 added
            // a brand-coloured aura (`shadow-[0_0_12px_2px_var
            // (--nav-row-aura-color),...]`) which is semantically
            // different — it's a brand-presence signal, not a
            // depth cue. The arbitrary-value `shadow-[...]` form
            // is fine; only the named depth tokens are banned.
            const activeRecipe =
                NAV_ITEM_SRC.match(
                    /export\s+const\s+NAV_ITEM_ACTIVE\s*=\s*['"]([^'"]+)['"]/,
                )?.[1] ?? '';
            expect(activeRecipe).not.toMatch(/\bshadow-(sm|md|lg|xl)\b/);
        });
    });

    describe('preserved invariants', () => {
        it('the band glow is still a `::before` shadow, separate from the row bevel', () => {
            // `before:shadow-[var(--nav-band-glow)]` paints the band's
            // halo. The row's `shadow-[var(--nav-bevel-shadow)]` is a
            // separate, inset, row-level shadow. Both must exist;
            // neither replaces the other.
            expect(NAV_ITEM_SRC).toMatch(
                /before:shadow-\[var\(--nav-band-glow\)\]/,
            );
        });
    });
});
