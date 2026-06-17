/**
 * Canonical KPI-card sparklines — every entity KPI page draws its sparklines
 * from the ONE shared pipeline (`@/lib/charts/kpi-trends`), not a hand-rolled
 * per-page fetch. Assets is the reference; the same six pages it was applied
 * to must each (a) import the shared hook + domain helper and (b) feed at
 * least one KPI card a `sparkline`.
 *
 * Locks the canonicalization so a new KPI page can't regress to a bespoke
 * trends fetch, and the data-backed cards keep their sparklines.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const CLIENTS: Record<string, string> = {
    Assets: 'src/app/t/[tenantSlug]/(app)/assets/AssetsClient.tsx',
    Controls: 'src/app/t/[tenantSlug]/(app)/controls/ControlsClient.tsx',
    Risks: 'src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx',
    Evidence: 'src/app/t/[tenantSlug]/(app)/evidence/EvidenceClient.tsx',
    Policies: 'src/app/t/[tenantSlug]/(app)/policies/PoliciesClient.tsx',
    Vendors: 'src/app/t/[tenantSlug]/(app)/vendors/VendorsClient.tsx',
};

describe('Canonical KPI sparklines — shared pipeline adoption', () => {
    it.each(Object.entries(CLIENTS))(
        '%s uses the shared kpi-trends pipeline + feeds a KPI card a sparkline',
        (_name, file) => {
            const src = read(file);
            // (a) shared hook + builder + domain helper from the canonical module
            expect(src).toMatch(
                /from\s+['"]@\/lib\/charts\/kpi-trends['"]/,
            );
            expect(src).toMatch(/useKpiTrends\(/);
            expect(src).toMatch(/buildKpiSparklines\(/);
            // (b) at least one KpiFilterCard is fed a sparkline + centered domain
            expect(src).toMatch(/sparkline=\{/);
            expect(src).toMatch(/sparklineDomain=\{centeredSparklineDomain\(/);
        },
    );

    it('the canonical module is the single source — no per-page /dashboard/trends fetch remains', () => {
        // The shared hook owns the only `/dashboard/trends` fetch. A page that
        // hand-rolls `fetch('/dashboard/trends')` again has bypassed it.
        for (const file of Object.values(CLIENTS)) {
            const src = read(file);
            expect(src).not.toMatch(/fetch\([^)]*dashboard\/trends/);
        }
    });
});
