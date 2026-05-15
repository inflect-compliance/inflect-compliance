/**
 * R17-PR3 — HeroMetric trend sparkline.
 *
 * PR-1 added the static ambient glow; PR-2 the breath animation.
 * PR-3 adds a tiny token-coloured trajectory line above the delta
 * chip — the trajectory leading INTO the current value, so the
 * masthead carries not just "where we are" + "where we came from"
 * but "the path we took to get here."
 *
 * Visual register: the sparkline + the up-arrow + the delta chip
 * read as one unit. Variant tone matches the delta semantic so the
 * spark stroke colour is identical to the chip text colour
 * (good → success, bad → error, neutral → muted).
 *
 * Five load-bearing invariants:
 *
 *   1. The new `sparkline` prop is typed as `SparklineData` — the
 *      canonical `ReadonlyArray<{date, value}>` shape consumed by
 *      every other Epic 59 sparkline surface. Reusing the shared
 *      type keeps the dashboard wiring (which already produces
 *      this shape for the chart platform) interchangeable across
 *      every consumer.
 *
 *   2. The render branch gates on `sparkline.length > 1 AND
 *      deltaInfo`. A single point isn't a trajectory; without a
 *      delta there's no semantic to drive the variant tone. Both
 *      conditions are load-bearing — the gate keeps the chart
 *      from rendering as a bare baseline (PR-1 visual regression)
 *      and from rendering with no tone to match.
 *
 *   3. The variant is resolved through `SEMANTIC_SPARKLINE_VARIANT`
 *      which maps the delta semantic 1:1 to the
 *      `MiniAreaChartVariant` enum. The map is the type-safety
 *      barrier — changing the SparklineVariant union without
 *      updating the map fails compilation, which means a future
 *      tone addition has to touch this site.
 *
 *   4. The sparkline wrapper carries `data-hero-metric-sparkline`
 *      + `data-hero-metric-sparkline-variant=<variant>` so the
 *      rendered DOM is the contract surface for later PRs (PR-4
 *      KPI tile redesign + count-up animation will read the same
 *      attributes when porting the pattern).
 *
 *   5. Composition with PR-1 + PR-2 stays intact — the wrapper
 *      still carries `relative isolate overflow-hidden`, the
 *      glow gradient + breath animation + ambient-glow data
 *      attribute. The sparkline is additive, not a replacement.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const HERO_SRC = fs.readFileSync(
    path.join(ROOT, 'src/components/ui/HeroMetric.tsx'),
    'utf8',
);

describe('R17-PR3 — HeroMetric trend sparkline', () => {
    it('exposes a `sparkline?: SparklineData` prop', () => {
        // Shared chart-platform type. Aliases to
        // `ReadonlyArray<{date, value}>` — every Epic 59 sparkline
        // consumer (KpiCard, TrendCard, MetricCard) speaks the
        // same shape, so the dashboard's data wiring stays
        // interchangeable.
        expect(HERO_SRC).toMatch(/sparkline\?\:\s*SparklineData/);
        expect(HERO_SRC).toMatch(
            /import\s+type\s+\{\s*SparklineData\s*\}\s+from\s+"@\/components\/ui\/charts"/,
        );
    });

    it('the render gate requires `sparkline.length > 1 && deltaInfo`', () => {
        // A single point isn't a trajectory. No delta means no
        // semantic to drive the variant tone. Both conditions are
        // load-bearing.
        expect(HERO_SRC).toMatch(
            /sparkline\s*&&\s*sparkline\.length\s*>\s*1\s*&&\s*deltaInfo/,
        );
    });

    it('the variant resolves through a typed semantic → variant map', () => {
        // The map IS the type-safety barrier — adding a new
        // sparkline variant without updating the map breaks
        // compilation, forcing the dev to think about the new
        // tone at the masthead callsite.
        expect(HERO_SRC).toMatch(
            /SEMANTIC_SPARKLINE_VARIANT\s*:\s*Record<\s*"good"\s*\|\s*"bad"\s*\|\s*"neutral"\s*,\s*MiniAreaChartVariant\s*>/,
        );
        // The three mappings — good → success, bad → error,
        // neutral → neutral (NOT muted; muted is text-only).
        expect(HERO_SRC).toMatch(/good:\s*"success"/);
        expect(HERO_SRC).toMatch(/bad:\s*"error"/);
        expect(HERO_SRC).toMatch(/neutral:\s*"neutral"/);
    });

    it('exposes the contract DOM attributes', () => {
        // `data-hero-metric-sparkline` is the locator surface;
        // `data-hero-metric-sparkline-variant` carries the resolved
        // tone for downstream PRs to compose against.
        expect(HERO_SRC).toMatch(/data-hero-metric-sparkline/);
        expect(HERO_SRC).toMatch(
            /data-hero-metric-sparkline-variant=\{[\s\S]*?SEMANTIC_SPARKLINE_VARIANT\[deltaInfo\.semantic\]\s*\}/,
        );
    });

    it('PR-1 + PR-2 contracts remain intact', () => {
        // The sparkline composes onto the masthead, not replaces
        // it. Glow continues carrying the warmth signal; the
        // sparkline adds the trajectory signal on top. The PR-2
        // animated breath was frozen at the floor by the
        // hero-static-glow PR (2026-05-15) — static opacity is
        // now the PR-2 contract. The hero-dimmer-glow follow-up
        // (same day) dropped that further to 0.30 (the original
        // floor still read as bright).
        expect(HERO_SRC).toMatch(/data-hero-ambient-glow/);
        expect(HERO_SRC).toMatch(/"relative\s+isolate\s+overflow-hidden"/);
        expect(HERO_SRC).toMatch(
            /before:bg-\[radial-gradient\(ellipse_640px_400px_at_18%_60%,\s*var\(--brand-subtle\)_0%,\s*transparent_72%\)\]/,
        );
        expect(HERO_SRC).toMatch(/"before:opacity-\[0\.30\]"/);
    });
});
