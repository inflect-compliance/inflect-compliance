/**
 * R17-PR2 — HeroMetric ambient-glow.
 *
 * ORIGINAL CONTRACT (R17-PR2, 2026-05-14). A 6s opacity palindrome
 * (0.65 → 1 → 0.65) on the HeroMetric glow's `::before` pseudo —
 * same identity-tier rhythm as the R14 brand-mark pulse and the
 * R15 nav-band halo-breath.
 *
 * CURRENT CONTRACT (hero-static-glow, 2026-05-15). The breath
 * animation was removed; the glow now paints STATICALLY at the
 * breath floor (opacity 0.65). User feedback: the breath drew the
 * eye to the masthead repeatedly and competed with the actual
 * content. The floor frame is the calmest read and keeps the
 * identity-tier brand wash without the recurring pulse.
 *
 * What this ratchet now locks:
 *
 *   1. HeroMetric paints the glow STATICALLY at `opacity-[0.65]`
 *      on the `::before` pseudo. NOT animated.
 *
 *   2. The breath animation utility + keyframe are GONE from the
 *      Tailwind config. (Avoids stale dead-code that could be
 *      re-applied accidentally.)
 *
 *   3. The PR-1 glow contracts are preserved — `data-hero-ambient-glow`
 *      attribute + the wrapper still carries `relative isolate
 *      overflow-hidden` + the same radial gradient. The static
 *      treatment composes onto the PR-1 glow, not a replacement.
 *
 *   4. The OTHER 6s identity-tier rhythms stay (R14 brand pulse,
 *      R15 halo-breath). Those decorate chrome, not the masthead
 *      content anchor. Their own ratchets cover them; this just
 *      asserts the hero is alone in its static treatment.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const HERO_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/HeroMetric.tsx'),
    'utf8',
);
const TW_CONFIG = fs.readFileSync(
    path.join(ROOT, 'tailwind.config.js'),
    'utf8',
);

describe('R17-PR2 — HeroMetric ambient glow (static after hero-static-glow)', () => {
    it('HeroMetric paints the glow STATICALLY at opacity-[0.65] on the ::before pseudo', () => {
        // The breath floor frozen as a static opacity. Any change
        // to this value (or removal of `before:opacity-*`) needs
        // a deliberate roadmap.
        expect(HERO_SRC).toMatch(/"before:opacity-\[0\.65\]"/);
    });

    it('HeroMetric does NOT carry the animation class', () => {
        // The class string `before:animate-hero-glow-breath` is
        // forbidden — a future PR that re-introduces the breath
        // must also restore the keyframe in tailwind.config.js,
        // and ideally write its own ratchet for the new shape.
        expect(HERO_SRC).not.toMatch(/before:animate-hero-glow-breath/);
    });

    it('tailwind config does NOT define the hero-glow-breath keyframe', () => {
        // No stale keyframe — dead code that could be referenced
        // by accident is removed.
        expect(TW_CONFIG).not.toMatch(/'hero-glow-breath':\s*\{/);
    });

    it('tailwind config does NOT register the hero-glow-breath animation utility', () => {
        expect(TW_CONFIG).not.toMatch(
            /'hero-glow-breath':\s*\n?\s*'hero-glow-breath/,
        );
    });

    it('PR-1 glow contracts remain intact — the static treatment composes onto the glow', () => {
        expect(HERO_SRC).toMatch(/data-hero-ambient-glow/);
        expect(HERO_SRC).toMatch(/"relative\s+isolate\s+overflow-hidden"/);
        expect(HERO_SRC).toMatch(
            /before:bg-\[radial-gradient\(ellipse_640px_400px_at_18%_60%,\s*var\(--brand-subtle\)_0%,\s*transparent_72%\)\]/,
        );
    });
});
