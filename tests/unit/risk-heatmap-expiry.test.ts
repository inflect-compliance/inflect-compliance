/**
 * Risk Heatmap & Evidence Expiry Calendar Widget Tests
 *
 * Structural tests verifying:
 *   1. Component exports & structure
 *   2. Empty state handling
 *   3. Color/urgency logic correctness
 *   4. Date formatting safety
 *   5. Backend DTO additions
 *   6. Dashboard integration
 */

import * as fs from 'fs';
import * as path from 'path';
import { urgencyFromDaysUntil, URGENCY_DAYS } from '@/lib/urgency';

const UI_DIR = path.resolve(__dirname, '../../src/components/ui');
const REPO_FILE = path.resolve(__dirname, '../../src/app-layer/repositories/DashboardRepository.ts');

// i18n: RiskHeatmap routes its user-facing strings through next-intl now, so
// the source no longer holds the English literals. (The EN_CHART catalog
// lookup was retired in PR-K along with the deleted RiskHeatmap tests.)
const USECASE_FILE = path.resolve(__dirname, '../../src/app-layer/usecases/dashboard.ts');
const DASHBOARD_PAGE_FILE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/dashboard/page.tsx',
);
// Epic 69 split the dashboard into a thin server shell + a
// `'use client'` component that owns the card composition. The
// page imports moved with the JSX, so structural assertions read
// both files as a single combined surface.
const DASHBOARD_CLIENT_FILE = path.resolve(
    __dirname,
    '../../src/app/t/[tenantSlug]/(app)/dashboard/DashboardClient.tsx',
);

// ─── Widget Exports ────────────────────────────────────────────────

// (RiskHeatmap Widget tests removed in PR-K — the legacy client
//  <RiskHeatmap> component was deleted, superseded by the config-driven
//  <RiskMatrix>. The SERVER-side heatmap DTO + DashboardRepository.getRiskHeatmap
//  are still exercised by the "Dashboard DTO Extensions" describe below.)

describe('ExpiryCalendar Widget', () => {
    const content = fs.readFileSync(path.join(UI_DIR, 'ExpiryCalendar.tsx'), 'utf-8');

    test('file exists and is substantial', () => {
        expect(content.length).toBeGreaterThan(1000);
    });

    test('exports default component and ExpiryItem type', () => {
        expect(content).toContain('export default function ExpiryCalendar');
        expect(content).toContain('export interface ExpiryItem');
    });

    test('handles empty state (no items)', () => {
        expect(content).toContain('items.length === 0');
        expect(content).toContain('No upcoming evidence expirations');
    });

    test('groups by urgency levels', () => {
        expect(content).toContain("'overdue'");
        expect(content).toContain("'urgent'");
        expect(content).toContain("'upcoming'");
        expect(content).toContain("'normal'");
    });

    test('urgency color coding', () => {
        expect(content).toContain('text-red-400');
        expect(content).toContain('text-amber-400');
        expect(content).toContain('text-yellow-400');
    });

    test('formats days until correctly', () => {
        expect(content).toContain("'Today'");
        expect(content).toContain("'Tomorrow'");
        expect(content).toContain('overdue');
    });

    test('date formatting uses UTC to avoid timezone shifts', () => {
        // Epic 58 — the inline UTC formatter was replaced by the
        // canonical `formatDateCompact` helper, which declares
        // `timeZone: 'UTC'` on its shared `Intl.DateTimeFormat` in
        // `src/lib/format-date.ts`. The UTC guarantee still holds;
        // the call site just delegates instead of hardcoding the
        // option bag.
        expect(content).toContain('formatDateCompact');
    });

    test('truncates long titles', () => {
        expect(content).toContain('truncate');
    });

    test('has scrollable overflow for long lists', () => {
        expect(content).toContain('overflow-y-auto');
    });

    test('supports className and id props', () => {
        expect(content).toContain("className?: string");
        expect(content).toContain("id?: string");
    });

    test('uses the canonical Card primitive surface', () => {
        // Roadmap-5 PR-1 — the glass-card literal moved into the
        // Card primitive. Components now compose cardVariants()
        // (or render `<Card>`) instead of referencing the legacy
        // class string directly.
        expect(content).toMatch(/cardVariants\(|<Card\b/);
    });
});

// ─── Backend DTO & Query Additions ──────────────────────────────────

describe('Dashboard DTO Extensions', () => {
    const repoContent = fs.readFileSync(REPO_FILE, 'utf-8');

    test('RiskHeatmapCell interface exported', () => {
        expect(repoContent).toContain('export interface RiskHeatmapCell');
        expect(repoContent).toContain('likelihood: number');
        expect(repoContent).toContain('impact: number');
        expect(repoContent).toContain('count: number');
    });

    test('EvidenceExpiryItem interface exported', () => {
        expect(repoContent).toContain('export interface EvidenceExpiryItem');
        expect(repoContent).toContain('nextReviewDate: string');
        expect(repoContent).toContain('daysUntil: number');
    });

    test('ExecutiveDashboardPayload includes riskHeatmap', () => {
        expect(repoContent).toContain('riskHeatmap: RiskHeatmapCell[]');
    });

    test('ExecutiveDashboardPayload includes upcomingExpirations', () => {
        expect(repoContent).toContain('upcomingExpirations: EvidenceExpiryItem[]');
    });

    test('getRiskHeatmap uses groupBy on likelihood + impact', () => {
        expect(repoContent).toContain('getRiskHeatmap');
        expect(repoContent).toContain("by: ['likelihood', 'impact']");
    });

    test('getUpcomingExpirations uses findMany with date filter', () => {
        expect(repoContent).toContain('getUpcomingExpirations');
        expect(repoContent).toContain('nextReviewDate');
        expect(repoContent).toContain('take: 20');
    });
});

describe('Dashboard Usecase Updates', () => {
    const usecaseContent = fs.readFileSync(USECASE_FILE, 'utf-8');

    test('fetches riskHeatmap in parallel', () => {
        expect(usecaseContent).toContain('DashboardRepository.getRiskHeatmap');
    });

    test('fetches upcomingExpirations in parallel', () => {
        expect(usecaseContent).toContain('DashboardRepository.getUpcomingExpirations');
    });

    test('returns riskHeatmap in payload', () => {
        expect(usecaseContent).toContain('riskHeatmap,');
    });

    test('returns upcomingExpirations in payload', () => {
        expect(usecaseContent).toContain('upcomingExpirations,');
    });
});

// ─── Dashboard Page Integration ─────────────────────────────────────

describe('Dashboard Page Integration', () => {
    const content =
        fs.readFileSync(DASHBOARD_PAGE_FILE, 'utf-8') +
        '\n' +
        fs.readFileSync(DASHBOARD_CLIENT_FILE, 'utf-8');

    // Epic 44 — the dashboard's heatmap migrated from the legacy
    // hardcoded `<RiskHeatmap>` to the config-driven `<RiskMatrix>`
    // engine. The page still surfaces a "risk-heatmap" id (E2E
    // selector preserved); the consuming component is now
    // `<RiskMatrix>` reading the tenant's `RiskMatrixConfig`.
    test('imports the config-driven RiskMatrix engine', () => {
        // PR3 perf: charts are lazy-loaded via next/dynamic, so the module is
        // referenced by `import('@/components/ui/RiskMatrix')` rather than a
        // static `from '…'`. Match either form — the intent is that the
        // dashboard pulls in the RiskMatrix engine.
        expect(content).toMatch(/@\/components\/ui\/RiskMatrix['"]/);
    });

    test('fetches the tenant matrix config server-side', () => {
        expect(content).toContain('getRiskMatrixConfig');
    });

    test('imports ExpiryCalendar', () => {
        expect(content).toMatch(/@\/components\/ui\/ExpiryCalendar['"]/);
    });

    test('renders RiskMatrix with the legacy `risk-heatmap` id (E2E selector preserved)', () => {
        expect(content).toContain('<RiskMatrix');
        expect(content).toContain('id="risk-heatmap"');
    });

    test('renders ExpiryCalendar with id', () => {
        expect(content).toContain('<ExpiryCalendar');
        expect(content).toContain('id="expiry-calendar"');
    });

    test('passes exec.riskHeatmap data to the matrix', () => {
        // The data shape (sparse `{ likelihood, impact, count }[]`)
        // is unchanged; only the consuming component swapped.
        expect(content).toContain('cells={exec.riskHeatmap}');
    });

    test('threads the tenant matrix config to the matrix', () => {
        expect(content).toContain('config={matrixConfig}');
    });

    test('passes exec.upcomingExpirations to ExpiryCalendar', () => {
        expect(content).toContain('items={exec.upcomingExpirations}');
    });

    test('heatmap and expiry calendar in the same grid row', () => {
        // Both should be in a lg:grid-cols-2 container
        const heatmapIdx = content.indexOf('risk-heatmap');
        const expiryIdx = content.indexOf('expiry-calendar');
        // They should be close together (same grid block)
        expect(Math.abs(heatmapIdx - expiryIdx)).toBeLessThan(600);
    });
});

// ─── Urgency Logic Unit Tests ───────────────────────────────────────

describe('ExpiryCalendar Urgency Logic', () => {
    const content = fs.readFileSync(path.join(UI_DIR, 'ExpiryCalendar.tsx'), 'utf-8');

    // These used to grep the widget's source for `daysUntil <= 7` /
    // `<= 14` literals. The thresholds now live in the shared
    // `@/lib/urgency` scale (the widget's private ≤14 tier was the only
    // place 14 appeared anywhere, and it made "upcoming" mean something
    // different here than on the calendar or the evidence KPI). Assert
    // the BEHAVIOUR of the shared classifier instead of the text of a
    // component that no longer owns the numbers.

    test('the widget consumes the shared scale rather than its own literals', () => {
        expect(content).toContain('urgencyFromDaysUntil');
        expect(content).not.toContain('daysUntil <= 14');
    });

    test('overdue: any negative distance', () => {
        expect(urgencyFromDaysUntil(-1)).toBe('overdue');
        expect(urgencyFromDaysUntil(-90)).toBe('overdue');
    });

    test('urgent: today through the 7-day boundary', () => {
        expect(urgencyFromDaysUntil(0)).toBe('urgent');
        expect(urgencyFromDaysUntil(URGENCY_DAYS.URGENT)).toBe('urgent');
    });

    test('upcoming: just past urgent, through the 30-day boundary', () => {
        expect(urgencyFromDaysUntil(URGENCY_DAYS.URGENT + 1)).toBe('upcoming');
        expect(urgencyFromDaysUntil(URGENCY_DAYS.UPCOMING)).toBe('upcoming');
    });

    test('normal: beyond the upcoming boundary', () => {
        expect(urgencyFromDaysUntil(URGENCY_DAYS.UPCOMING + 1)).toBe('normal');
    });

    test('ordered groups: overdue first, normal last', () => {
        const overdueIdx = content.indexOf("'overdue'");
        const normalIdx = content.lastIndexOf("'normal'");
        expect(overdueIdx).toBeLessThan(normalIdx);
    });
});

// ─── Risk Heatmap Score Logic Unit Tests ─────────────────────────────

// (RiskHeatmap Score Logic tests removed in PR-K alongside the deleted
//  client <RiskHeatmap> component — <RiskMatrix> is the config-driven
//  successor with its own coverage.)
