/**
 * R17-PR8 — Risk Distribution donut subscribes to the chart-filter
 * context.
 *
 * PR-6 shipped the foundation; PR-7 made the 6 KPI tiles
 * clickable. PR-8 is the first chart consumer: the Risk
 * Distribution card now reacts to the selected KPI.
 *
 *   • When `selectedKpi === 'risks'` → card gains a brand-default
 *     ring + brand-subtle "Focused" badge. The Risks tile and
 *     the donut visually connect.
 *   • When `selectedKpi !== null && selectedKpi !== 'risks'` →
 *     card dims (opacity-60). The user's focus is elsewhere; the
 *     donut steps back so the eye doesn't race past the
 *     focused-elsewhere area.
 *   • When `selectedKpi === null` → baseline render, byte-for-byte
 *     identical to pre-R17.
 *
 * Four load-bearing invariants:
 *
 *   1. The section calls `useDashboardChartFocus()` to read
 *      `selectedKpi`. No prop-drilling — keeps the context as
 *      the single source of truth.
 *
 *   2. The focused-vs-dimmed-vs-baseline branching uses the same
 *      `selectedKpi === 'risks'` literal as PR-7's wiring. A
 *      typo / drift here would silently desync the click from the
 *      chart response — locked with a regex.
 *
 *   3. The rendered DOM exposes `data-chart-focus="true"` (when
 *      focused) and `data-chart-dimmed="true"` (when dimmed) so
 *      E2E selectors and future styling layers can target the
 *      states without parsing className strings.
 *
 *   4. The "Focused" badge renders only when the section is the
 *      focused chart for the current KPI. The badge text + tone
 *      are the user-visible "you clicked X, this is X" signal.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const SRC = fs.readFileSync(
    path.join(
        ROOT,
        'src/app/t/[tenantSlug]/(app)/dashboard/DashboardClient.tsx',
    ),
    'utf8',
);

describe('R17-PR8 — Risk Distribution donut filter-aware', () => {
    it('section reads selectedKpi via useDashboardChartFocus', () => {
        // Pattern match scoped to the function body — the import
        // is shared with PR-7, but this assertion proves the
        // donut section ITSELF subscribes.
        expect(SRC).toMatch(
            /function\s+RiskDistributionSection[\s\S]*?const\s+\{\s*selectedKpi\s*\}\s*=\s*useDashboardChartFocus\(\)/,
        );
    });

    it('focused vs dimmed branching uses the `risks` key consistently', () => {
        // PR-7's wiring uses click('risks') + isSelected('risks').
        // PR-8 reads the same key. Drift here = silent desync.
        expect(SRC).toMatch(
            /const\s+isFocused\s*=\s*selectedKpi\s*===\s*'risks'/,
        );
        expect(SRC).toMatch(
            /const\s+isDimmed\s*=\s*selectedKpi\s*!==\s*null\s*&&\s*!isFocused/,
        );
    });

    it('exposes `data-chart-focus` + `data-chart-dimmed` data attributes', () => {
        expect(SRC).toMatch(
            /data-chart-focus=\{isFocused\s*\?\s*['"]true['"]\s*:\s*undefined\}/,
        );
        expect(SRC).toMatch(
            /data-chart-dimmed=\{isDimmed\s*\?\s*['"]true['"]\s*:\s*undefined\}/,
        );
    });

    it('focused state carries brand ring + ring-offset', () => {
        // Mirrors the KpiCard selected affordance (PR-7) so the
        // tile and the chart visually connect.
        expect(SRC).toMatch(
            /isFocused\s*&&\s*['"]ring-2\s+ring-brand-default\s+ring-offset-2\s+ring-offset-bg-page['"]/,
        );
    });

    it('dimmed state carries opacity-60', () => {
        expect(SRC).toMatch(/isDimmed\s*&&\s*['"]opacity-60['"]/);
    });

    it('focus is indicated by the ring only — the textual "Focused" badge was removed', () => {
        // The brand ring (asserted above) is the sole focus affordance;
        // the in-heading "Focused" pill was removed per product direction,
        // so the badge marker must not reappear on any dashboard chart.
        expect(SRC).not.toMatch(/data-chart-focus-badge/);
    });
});
