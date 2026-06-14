/**
 * Item 31 — risk Overview single-score-card ratchet.
 *
 * The risk detail Overview used to render Likelihood, Impact and
 * Inherent Score as THREE separate `<KPIStat>` cards in a `grid-cols-3`.
 * Item 31 collapses them into ONE card (headline = inherent score,
 * Likelihood × Impact as the supporting breakdown), mirroring the
 * controls Overview single-card pattern.
 *
 * This ratchet locks the single-card shape so a future edit can't
 * silently bring back the three-card grid.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const PAGE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/risks/[riskId]/page.tsx',
);

describe('item 31 — risk Overview single score card', () => {
    const src = fs.readFileSync(PAGE, 'utf8');

    it('renders a single risk-score card', () => {
        expect(src).toContain('data-testid="risk-score-card"');
    });

    it('no longer renders the three-card Likelihood / Impact / Inherent grid', () => {
        // The old shape: three <KPIStat> cards (one labelled "Inherent
        // Score") inside a `grid-cols-3` wrapper. The single card still
        // routes through `<KPIStat>` — the `metric-typography` ratchet
        // requires every oversized number to flow through that
        // primitive — but with the consolidated "Inherent Risk Score"
        // label and the L×I breakdown moved into the `description`
        // slot, NOT as separate `value={risk.likelihood}` /
        // `value={risk.impact}` cards.
        expect(src).not.toContain('label="Inherent Score"');
        expect(src).not.toContain('value={risk.likelihood}');
        expect(src).not.toContain('value={risk.impact}');
        expect(src).not.toContain('grid-cols-3 gap-default');
    });

    it('keeps the Likelihood × Impact breakdown visible in the card', () => {
        // Both component dimensions still appear so the inherent-score
        // derivation stays legible.
        expect(src).toMatch(/Likelihood/);
        expect(src).toMatch(/Impact/);
        expect(src).toMatch(/risk\.inherentScore/);
    });
});
