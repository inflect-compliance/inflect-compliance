/**
 * Dashboard "close the compute-vs-render gap" ratchet.
 *
 * Locks the six remediations that closed the gap between what the
 * executive dashboard COMPUTES and what the user can USE:
 *
 *   1. Unrendered compute is gone — `controlsByStatus` + the dead
 *      `DashboardStats` fields (assets / clausesReady / totalClauses
 *      / unreadNotifications) no longer computed; exceptions +
 *      treatment-plan cards ARE rendered with a drill-through.
 *   2. KPI tiles can navigate — each `<KpiCard>` carries an `href`.
 *   3. The chart interaction is honestly named "focus", not "filter".
 *   4. Mutation sites invalidate the dashboard cache; the trends key
 *      carries its `?days=` window so a `mutate()` matches.
 *   5. Recent Activity is humanised + identified + linked (no raw
 *      lowercased enum render).
 *   6. Posture regenerate is gated on `controls.edit`, and the
 *      loading skeleton mirrors the shipped layout.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const ROOT = path.resolve(__dirname, '../..');
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const REPO = read('src/app-layer/repositories/DashboardRepository.ts');
const USECASE = read('src/app-layer/usecases/dashboard.ts');
const CLIENT = read('src/app/t/[tenantSlug]/(app)/dashboard/DashboardClient.tsx');
const CONTEXT = read('src/app/t/[tenantSlug]/(app)/dashboard/DashboardChartContext.tsx');
const KPI_CARD = read('src/components/ui/KpiCard.tsx');
const ACTIVITY_CARD = read('src/app/t/[tenantSlug]/(app)/dashboard/RecentActivityCard.tsx');
const SWR_KEYS = read('src/lib/swr-keys.ts');
const LOADING = read('src/app/t/[tenantSlug]/(app)/dashboard/loading.tsx');
const REGEN_ROUTE = read(
    'src/app/api/t/[tenantSlug]/dashboard/posture-summary/regenerate/route.ts',
);

describe('1. unrendered compute — surfaced or removed', () => {
    it('stopped computing controlsByStatus (payload + usecase + method gone)', () => {
        expect(REPO).not.toMatch(/controlsByStatus/);
        expect(REPO).not.toMatch(/getControlsByStatus/);
        expect(USECASE).not.toMatch(/controlsByStatus/);
    });

    it('dropped the dead DashboardStats fields + their queries', () => {
        // The DashboardStats interface no longer declares them...
        const statsIface = REPO.slice(
            REPO.indexOf('export interface DashboardStats'),
            REPO.indexOf('}', REPO.indexOf('export interface DashboardStats')),
        );
        for (const dead of ['assets', 'clausesReady', 'totalClauses', 'unreadNotifications']) {
            expect(statsIface).not.toMatch(new RegExp(`\\b${dead}\\b`));
        }
        // ...and getStats no longer runs the queries that backed them.
        const getStats = REPO.slice(
            REPO.indexOf('static async getStats'),
            REPO.indexOf('static async getControlCoverage'),
        );
        expect(getStats).not.toMatch(/clauseProgress\.findMany/);
        expect(getStats).not.toMatch(/notification\.count/);
        expect(getStats).not.toMatch(/asset\.count/);
        // The still-consumed fields survive (assistant reads these).
        expect(getStats).toMatch(/control\.count/);
    });

    it('renders the Exception + Treatment-Plan cards with a drill-through', () => {
        expect(CLIENT).toMatch(/ExceptionSummaryCard/);
        expect(CLIENT).toMatch(/TreatmentPlanCard/);
        expect(CLIENT).toMatch(/exec\.exceptions/);
        expect(CLIENT).toMatch(/exec\.treatmentPlans/);
        // each card has a data-drill-link anchor
        expect(CLIENT).toMatch(/data-drill-link/);
    });
});

describe('2. KPI tiles can navigate', () => {
    it('renders a drill-through link per tile (sibling overlay, KpiCard stays lean)', () => {
        // The drill link lives in DashboardClient's <KpiTile> wrapper, NOT
        // inside the shared KpiCard primitive (which must not grow a
        // next/link dependency — locked by dashboard-widgets.test.ts).
        expect(CLIENT).toMatch(/function KpiTile/);
        expect(CLIENT).toMatch(/data-kpi-drill/);
        expect(KPI_CARD).not.toMatch(/next\/link/);
    });

    it('every KPI tile is given a drill-through href', () => {
        for (const target of ['/controls', '/risks', '/evidence', '/tasks', '/policies', '/findings']) {
            expect(CLIENT).toMatch(new RegExp(`drillHref=\\{href\\('${target}`));
        }
    });
});

describe('3. chart interaction is honestly "focus", not "filter"', () => {
    it('exports useDashboardChartFocus, not the old filter name', () => {
        expect(CONTEXT).toMatch(/export function useDashboardChartFocus/);
        expect(CONTEXT).not.toMatch(/useDashboardChartFilter/);
        expect(CONTEXT).not.toMatch(/DashboardChartFilter\b/);
    });

    it('drops the aspirational "filter their data" docstring', () => {
        expect(CONTEXT).not.toMatch(/filter their data/);
        expect(CONTEXT).not.toMatch(/data filtered\s+to the selected/);
    });
});

describe('4. dashboard cache invalidation is wired + trends key aligned', () => {
    it('trends key carries its ?days= window', () => {
        expect(SWR_KEYS).toMatch(/trends:\s*\(days\s*=\s*30\)\s*=>\s*`\/dashboard\/trends\?days=\$\{days\}`/);
    });

    it('the three mutation sites invalidate the executive dashboard key', () => {
        const controls = read('src/app/t/[tenantSlug]/(app)/controls/[controlId]/page.tsx');
        const evidence = read('src/app/t/[tenantSlug]/(app)/evidence/UploadEvidenceModal.tsx');
        const risks = read('src/app/t/[tenantSlug]/(app)/risks/RisksClient.tsx');
        expect(controls).toMatch(/CACHE_KEYS\.dashboard\.executive\(\)/);
        expect(evidence).toMatch(/CACHE_KEYS\.dashboard\.executive\(\)/);
        expect(risks).toMatch(/CACHE_KEYS\.dashboard\.executive\(\)/);
    });
});

describe('5. Recent Activity is humanised + identified + linked', () => {
    it('no longer renders raw lowercased enums', () => {
        expect(ACTIVITY_CARD).not.toMatch(/\.action\.toLowerCase\(\)/);
        expect(ACTIVITY_CARD).not.toMatch(/\.entity\.toLowerCase\(\)/);
    });

    it('uses the humaniser + the enriched (title-bearing) query + links rows', () => {
        expect(ACTIVITY_CARD).toMatch(/activity-humanize/);
        expect(ACTIVITY_CARD).toMatch(/getRecentActivityDetailed/);
        expect(ACTIVITY_CARD).toMatch(/from 'next\/link'/);
        expect(REPO).toMatch(/static async getRecentActivityDetailed/);
    });
});

describe('6. permission + skeleton corrected', () => {
    it('posture regenerate is gated on controls.edit, not reports.export', () => {
        expect(REGEN_ROUTE).toMatch(/requirePermission\('controls\.edit'/);
        expect(REGEN_ROUTE).not.toMatch(/reports\.export/);
        expect(CLIENT).toMatch(/canRegenerate=\{perms\.controls\.edit\}/);
    });

    it('loading.tsx uses the dashboard-specific DashboardSkeleton', () => {
        expect(LOADING).toMatch(/DashboardSkeleton/);
    });
});
