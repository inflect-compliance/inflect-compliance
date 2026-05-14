/**
 * R17-PR4 — MetricCard corner brand glow.
 *
 * The HeroMetric masthead carries an ambient radial glow + 6s
 * breath (R17 PR-1 + PR-2). PR-4 extends the SAME warmth language
 * to the KPI / Metric tiles in the dashboard grid below the
 * masthead, but with two deliberate dampers:
 *
 *   1. SMALLER glow: a 200px circle anchored at the upper-left
 *      corner (10% / 0%), brand-subtle alpha fading to transparent
 *      at 55%. The masthead's 640×400 ellipse + 72% fade is the
 *      "verdict-tier" wash; the card's 200-circle + 55% fade is
 *      the "highlight-tier" wash. Smaller surface ⇒ proportionally
 *      smaller warmth.
 *
 *   2. NO breath animation. The masthead is ONE breathing surface.
 *      A grid of 3-6 cards each breathing on the same 6s tempo
 *      would be hypnotic; staggering would be noisy. Static glow
 *      on every card keeps the warmth present without competing
 *      for the eye's attention.
 *
 * Four load-bearing invariants:
 *
 *   1. The card wrapper carries `relative isolate overflow-hidden`
 *      — required for the `before:` pseudo's `-z-10` to resolve
 *      against a local stacking context AND for the soft edge to
 *      stay clipped to the card boundary.
 *
 *   2. The `before:` pseudo carries the exact radial-gradient
 *      shape: `circle 200px at 10% 0%`, brand-subtle at 0% fading
 *      to transparent at 55%. Anchoring at 10% / 0% places the
 *      brightest spot just inside the upper-left corner (where the
 *      icon + eyebrow sit). The 55% fade lets the lower-right
 *      portion stay clean for the value + indicator + sparkline.
 *
 *   3. The pseudo has NO animation — `before:animate-*` MUST be
 *      absent. The static glow is the contract; adding breath
 *      here would sync rhythms across the dashboard grid.
 *
 *   4. The card exposes `data-metric-card-corner-glow` so the
 *      rendered DOM is the contract surface for future PRs.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/MetricCard.tsx'),
    'utf8',
);

describe('R17-PR4 — MetricCard corner glow', () => {
    it('wrapper carries `relative isolate overflow-hidden`', () => {
        expect(SRC).toMatch(/"relative\s+isolate\s+overflow-hidden"/);
    });

    it('before: pseudo declares the canonical layering classes', () => {
        expect(SRC).toMatch(
            /before:content-\[''\][\s\S]*?before:absolute[\s\S]*?before:inset-0[\s\S]*?before:-z-10[\s\S]*?before:pointer-events-none/,
        );
    });

    it('radial gradient is `circle 200px at 10% 0%` brand-subtle → transparent 55%', () => {
        // Smaller + tighter than the HeroMetric ambient wash —
        // matches the "highlight-tier" intent (PR-1's masthead is
        // "verdict-tier"). 10% / 0% anchors the brightest spot
        // just inside the upper-left corner.
        expect(SRC).toMatch(
            /before:bg-\[radial-gradient\(circle_200px_at_10%_0%,\s*var\(--brand-subtle\)_0%,\s*transparent_55%\)\]/,
        );
    });

    it('the glow does NOT animate (intentional damper vs the hero breath)', () => {
        // Three+ cards breathing on the same 6s tempo would be
        // hypnotic. Static keeps the grid calm.
        expect(SRC).not.toMatch(/before:animate-/);
    });

    it('exposes the `data-metric-card-corner-glow` attribute', () => {
        expect(SRC).toMatch(/data-metric-card-corner-glow/);
    });
});
