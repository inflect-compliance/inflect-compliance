/**
 * Roadmap-15 PR-3 — Top-to-bottom reveal sweep on the band.
 *
 * R12-PR5 + R13-PR9 reveal the band on hover via an opacity 0 → 100
 * transition (with a parallel geometry expansion: top/bottom/width).
 * Honest, but uniform — the whole band brightens at once. The eye
 * reads it as "the band fades in"; not as "the band materializes".
 *
 * R15-PR3 layers a third behaviour on top of the opacity + geometry
 * transitions: a one-shot `clip-path: inset(...)` sweep from the
 * top of the band to the bottom over 450ms ease-out. The clip
 * progressively reveals the band's pixels from top down — like a
 * stardust trace drawing itself in, or a curtain rising. Combined
 * with the existing opacity fade (which gives the colours their
 * mass) and the geometry expansion (which gives the band its
 * physical reach), the reveal completes the "materialize"
 * vocabulary.
 *
 * Mechanism:
 *
 *   - Keyframe `nav-band-reveal-sweep` animates `clip-path` from
 *     `inset(100% 0 0 0)` (fully clipped from below the top edge)
 *     to `inset(0)` (fully revealed). Both stops use the same
 *     `inset(...)` shape signature — required for clip-path to
 *     interpolate smoothly.
 *
 *   - Animation entry: 450ms ease-out, NO `infinite` keyword. The
 *     reveal plays ONCE per engagement (hover-enter or activation)
 *     and then ends — leaving the band's `clip-path` at the keyframe's
 *     100% state (full reveal). No `animation-fill-mode: forwards`
 *     needed because the 100% state matches the band's resting
 *     visible state.
 *
 *   - Composed into `nav-band-alive` as the FIRST track. Animation
 *     order matches visual choreography order:
 *         reveal (materialize) → shimmer (drift) → halo-breath (pulse).
 *     The 4-second shimmer + 6-second halo-breath keep running
 *     forever; the reveal completes at 450ms and stays at full
 *     reveal for the remainder of the engagement.
 *
 * What this ratchet does NOT police:
 *
 *   - The exact duration (450ms). A future tuning to 400ms or 500ms
 *     stays within the "felt deliberate, not a flash" boundary.
 *   - The clip-path shape direction. A future PR that flips it to
 *     bottom-up (`inset(0 0 100% 0)` → `inset(0)`) would be a
 *     conscious vocabulary change and must update this ratchet.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const TAILWIND_CONFIG = fs.readFileSync(
    path.join(ROOT, 'tailwind.config.js'),
    'utf8',
);

describe('Roadmap-15 PR-3 — band reveal sweep', () => {
    describe('keyframe declaration', () => {
        it('declares `nav-band-reveal-sweep` in tailwind.config.js keyframes', () => {
            expect(TAILWIND_CONFIG).toMatch(
                /'nav-band-reveal-sweep':\s*\{/,
            );
        });

        it('animates `clip-path` (not transform / opacity / filter)', () => {
            // clip-path is the third channel the R15 vocabulary
            // reaches for — opacity is owned by R12-PR5 reveal,
            // transform by R13-PR8 press, background-position by
            // R13-PR3 shimmer, filter by R15-PR2 halo-breath. Each
            // channel sits orthogonal so the four motions compose
            // cleanly on one element.
            const declStart = TAILWIND_CONFIG.indexOf(
                "'nav-band-reveal-sweep': {",
            );
            expect(declStart).toBeGreaterThan(-1);
            const tail = TAILWIND_CONFIG.slice(declStart);
            const slice = tail.slice(0, tail.indexOf('100%') + 200);
            expect(slice).toMatch(/clip-path/);
            expect(slice).not.toContain('transform');
            expect(slice).not.toContain('translate');
            expect(slice).not.toContain('scale');
            expect(slice).not.toContain('background-position');
            expect(slice).not.toContain('opacity');
            expect(slice).not.toContain('filter');
        });

        it('starts fully clipped from the top (inset 100% 0 0 0)', () => {
            // The 0% state hides every pixel of the band — clip-path
            // `inset(100% 0 0 0)` insets from the top by the band's
            // full height, leaving nothing visible. This is the
            // "before the reveal" state.
            const declStart = TAILWIND_CONFIG.indexOf(
                "'nav-band-reveal-sweep': {",
            );
            const tail = TAILWIND_CONFIG.slice(declStart);
            const slice = tail.slice(0, tail.indexOf('100%') + 200);
            expect(slice).toMatch(
                /'0%':\s*\{\s*'clip-path':\s*'inset\(100%\s+0\s+0\s+0\)'/,
            );
        });

        it('ends fully revealed (inset 0 0 0 0)', () => {
            // The 100% state reveals every pixel — `inset(0 0 0 0)`
            // is the no-op shape. Both stops MUST use the same
            // four-value inset signature so clip-path interpolates
            // smoothly. Mixing `inset(100% 0 0 0)` with `inset(0)`
            // would compare different shape signatures and the
            // animation would snap rather than sweep.
            const declStart = TAILWIND_CONFIG.indexOf(
                "'nav-band-reveal-sweep': {",
            );
            const tail = TAILWIND_CONFIG.slice(declStart);
            const slice = tail.slice(0, tail.indexOf("'0%'") + 400);
            expect(slice).toMatch(
                /'100%':\s*\{\s*'clip-path':\s*'inset\(0\s+0\s+0\s+0\)'/,
            );
        });
    });

    describe('animation entry', () => {
        it('wires `animation.nav-band-reveal-sweep` with 450ms ease-out (one-shot)', () => {
            // 450ms — felt-but-not-noticed; long enough for the
            // top-down sweep to register, short enough that a
            // quick hover doesn't outpace it. ease-out lands the
            // bottom edge softly. CRUCIALLY: no `infinite` — the
            // reveal plays once per engagement.
            expect(TAILWIND_CONFIG).toMatch(
                /'nav-band-reveal-sweep':\s*'nav-band-reveal-sweep\s+450ms\s+ease-out'/,
            );
        });

        it('does NOT use `infinite` — reveal is one-shot only', () => {
            // The reveal MUST end. An infinite reveal would
            // continuously hide and re-show the band, which is
            // not the intent. Lock the absence of `infinite` on
            // this animation entry specifically.
            const entryMatch = TAILWIND_CONFIG.match(
                /'nav-band-reveal-sweep':\s*'([^']+)'/g,
            );
            expect(entryMatch).not.toBeNull();
            // The second match is the animation entry (first is the
            // keyframe declaration). Both should be free of `infinite`,
            // but specifically the animation entry must be.
            const animationEntry = entryMatch!.find((m) =>
                /'nav-band-reveal-sweep\s+/.test(m),
            );
            expect(animationEntry).not.toBeUndefined();
            expect(animationEntry).not.toContain('infinite');
        });
    });

    describe('nav-band-alive composition', () => {
        it('`nav-band-alive` includes the reveal-sweep track', () => {
            const aliveMatch = TAILWIND_CONFIG.match(
                /'nav-band-alive':\s*'([^']+)'/,
            );
            expect(aliveMatch).not.toBeNull();
            expect(aliveMatch![1]).toContain('nav-band-reveal-sweep');
        });

        it('reveal-sweep is the FIRST track (materialize before drift before pulse)', () => {
            // Animation order matches visual choreography. The
            // reveal materializes the band; then the shimmer drifts
            // colour along its length; then the halo-breath pulses
            // luminosity on top. Order also matters for how CSS
            // resolves the initial frame — the reveal's 0% state
            // (clip-path inset 100%) needs to win the first frame.
            const aliveMatch = TAILWIND_CONFIG.match(
                /'nav-band-alive':\s*'([^']+)'/,
            );
            expect(aliveMatch).not.toBeNull();
            const value = aliveMatch![1];
            const revealIdx = value.indexOf('nav-band-reveal-sweep');
            const shimmerIdx = value.indexOf('nav-band-shimmer');
            const breathIdx = value.indexOf('nav-band-halo-breath');
            expect(revealIdx).toBeGreaterThan(-1);
            expect(shimmerIdx).toBeGreaterThan(revealIdx);
            expect(breathIdx).toBeGreaterThan(shimmerIdx);
        });

        it('preserves per-track durations — 450ms + 4s + 6s', () => {
            // Each track inside the composed string carries its
            // own duration. Without explicit per-track values, all
            // tracks would inherit the same animation-duration.
            const aliveMatch = TAILWIND_CONFIG.match(
                /'nav-band-alive':\s*'([^']+)'/,
            );
            expect(aliveMatch).not.toBeNull();
            const value = aliveMatch![1];
            expect(value).toMatch(/nav-band-reveal-sweep\s+450ms\s+ease-out/);
            expect(value).toMatch(/nav-band-shimmer\s+4s\s+ease-in-out\s+infinite/);
            expect(value).toMatch(
                /nav-band-halo-breath\s+6s\s+ease-in-out\s+infinite/,
            );
        });

        it('reveal-sweep track has NO `infinite` keyword inside the composed value', () => {
            // The composed string should look like:
            //   nav-band-reveal-sweep 450ms ease-out,
            //   nav-band-shimmer 4s ease-in-out infinite,
            //   nav-band-halo-breath 6s ease-in-out infinite
            // The `infinite` keywords appear ONLY on the second
            // and third tracks. A future "let's loop the reveal"
            // PR would re-engage the reveal continuously, which
            // is not the intent.
            const aliveMatch = TAILWIND_CONFIG.match(
                /'nav-band-alive':\s*'([^']+)'/,
            );
            expect(aliveMatch).not.toBeNull();
            const value = aliveMatch![1];
            // Bound the reveal-sweep track: from its start to the
            // first comma (which separates tracks).
            const firstCommaAfterReveal = value.indexOf(
                ',',
                value.indexOf('nav-band-reveal-sweep'),
            );
            expect(firstCommaAfterReveal).toBeGreaterThan(-1);
            const revealTrack = value.slice(0, firstCommaAfterReveal);
            expect(revealTrack).toContain('nav-band-reveal-sweep');
            expect(revealTrack).not.toContain('infinite');
        });
    });
});
