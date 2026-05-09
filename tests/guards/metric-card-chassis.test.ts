/**
 * v2-PR-8 — `<MetricCard>` chassis primitive contract + adoption.
 *
 * The chassis owns LAYOUT for any "single number" card. Specialised
 * wrappers (`KpiCard`, future `<HeroMetric>`, `ProgressCard`,
 * `TrendCard`) own the smart rendering (animated number, shimmer,
 * gradient text, sparkline) and pass through into chassis slots.
 *
 * Why a ratchet:
 *   - Without the chassis, every metric-shaped card hand-rolled the
 *     `glass-card p-4 hover:border-border-emphasis` frame + the
 *     eyebrow / value / subtitle / trailing rhythm. Drift between
 *     them was invisible to reviewers.
 *   - The 8 → 3 chassis target (per the v2 plan) starts with this
 *     primitive. ChartCard + ListCard chassis ship in later PRs;
 *     KpiCard, ProgressCard, TrendCard, and any future *Card MUST
 *     compose via the chassis from this point forward.
 *
 * Pairs with:
 *   - src/components/ui/MetricCard.tsx (the chassis)
 *   - src/components/ui/KpiCard.tsx (canonical adoption — first
 *     specialised wrapper to consume the chassis)
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");

describe("v2-PR-8 MetricCard chassis primitive contract", () => {
    const src = fs.readFileSync(
        path.join(ROOT, "src/components/ui/MetricCard.tsx"),
        "utf8",
    );

    it("exports the MetricCard component + props interface", () => {
        expect(src).toMatch(/export\s+function\s+MetricCard/);
        expect(src).toMatch(/export\s+interface\s+MetricCardProps/);
    });

    it("declares the documented slot props", () => {
        for (const slot of [
            "icon",
            "eyebrow",
            "headerAction",
            "children",
            "indicator",
            "subtitle",
            "trailing",
        ]) {
            expect(src).toMatch(new RegExp(`\\b${slot}\\??:`));
        }
    });

    it("eyebrow is required (no `?`); other slots are optional", () => {
        expect(src).toMatch(/\beyebrow:\s*React\.ReactNode/);
        for (const slot of [
            "icon",
            "headerAction",
            "children",
            "indicator",
            "subtitle",
            "trailing",
        ]) {
            expect(src).toMatch(new RegExp(`\\b${slot}\\?:`));
        }
    });

    it("renders the canonical glass-card + hover-border frame", () => {
        expect(src).toMatch(/glass-card\s+p-4/);
        expect(src).toMatch(/hover:border-border-emphasis/);
        expect(src).toMatch(/transition-colors\s+duration-150\s+ease-out/);
    });

    it("renders the value slot with `tabular-nums`", () => {
        // Tabular-nums keeps the headline digits aligned during
        // <AnimatedNumber> ticks — without it the value column dances.
        expect(src).toMatch(/tabular-nums/);
    });

    it("forwards stable test markers per slot", () => {
        for (const id of [
            "data-metric-card",
            "data-metric-card-eyebrow",
            "data-metric-card-header-action",
            "data-metric-card-value",
            "data-metric-card-indicator",
            "data-metric-card-subtitle",
            "data-metric-card-trailing",
        ]) {
            expect(src).toContain(id);
        }
    });
});

describe("v2-PR-8 KpiCard adoption", () => {
    const src = fs.readFileSync(
        path.join(ROOT, "src/components/ui/KpiCard.tsx"),
        "utf8",
    );

    it("imports + renders <MetricCard>", () => {
        expect(src).toMatch(
            /import\s+\{\s*MetricCard\s*\}\s+from\s+["']@\/components\/ui\/MetricCard["']/,
        );
        expect(src).toMatch(/<MetricCard\b/);
    });

    it("no longer hand-rolls the glass-card frame", () => {
        // Before v2-PR-8 KpiCard wrapped its own
        // `<div className="glass-card p-4 hover:border-border-emphasis">`.
        // Now the chassis owns that — KpiCard returns <MetricCard>
        // directly.
        expect(src).not.toMatch(
            /<div[^>]*className="`glass-card p-4 hover:border-border-emphasis/,
        );
    });
});
