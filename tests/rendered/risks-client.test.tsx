/**
 * Render test for the risks LIST page island (`RisksClient`). The large
 * client component is otherwise unexercised by the usecase suites — this
 * mounts it with mocked SWR + navigation and walks the register view's
 * render path: header, KPI cards, the full column-cell ladder (code,
 * title, score chip + ALE chip, level band, status badge, owner,
 * treatment, controls, tasks), the create-button gate, and the empty
 * state. The heatmap view stays lazy (default view is `register`) so the
 * visx engine never loads.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';

jest.mock('next/navigation', () => ({
    useParams: () => ({ tenantSlug: 'acme' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/t/acme/risks',
    useSearchParams: () => new URLSearchParams(),
}));

const mockSWR = jest.fn();
jest.mock('@/lib/hooks/use-tenant-swr', () => ({
    useTenantSWR: (...args: unknown[]) => mockSWR(...args),
}));

// Stable hydrated "now" so the overdue-review KPI runs its date branch
// deterministically (instead of the null first-render branch).
jest.mock('@/lib/hooks/use-hydrated-now', () => ({
    useHydratedNow: () => new Date('2026-06-02T00:00:00.000Z'),
}));

import { RisksClient } from '@/app/t/[tenantSlug]/(app)/risks/RisksClient';
import { DEFAULT_RISK_MATRIX_CONFIG } from '@/lib/risk-matrix/defaults';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TenantProvider, type TenantContextValue } from '@/lib/tenant-context-provider';
import { getPermissionsForRole } from '@/lib/permissions';

const TENANT_CTX: TenantContextValue = {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'acme',
    tenantName: 'Acme',
    role: 'OWNER',
    permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
    appPermissions: getPermissionsForRole('OWNER'),
};

interface RiskListItem {
    id: string;
    key?: string | null;
    title: string;
    threat: string;
    likelihood: number;
    impact: number;
    inherentScore: number;
    category?: string | null;
    treatment: string | null;
    status?: string;
    nextReviewAt?: string | null;
    treatmentOwner?: string | null;
    ownerUserId?: string | null;
    owner?: { id: string; name: string | null; email: string | null } | null;
    asset: { name: string } | null;
    controls: unknown[];
    taskTotal?: number;
    taskDone?: number;
    sleAmount?: number | null;
    aroAmount?: number | null;
    fairAle?: number | null;
    residualLikelihood?: number | null;
    residualImpact?: number | null;
    residualScore?: number | null;
}

function makeRow(overrides: Partial<RiskListItem> = {}): RiskListItem {
    return {
        id: 'risk_1',
        key: 'RSK-1',
        title: 'Ransomware on the billing cluster',
        threat: 'Malware',
        likelihood: 4,
        impact: 5,
        inherentScore: 20,
        category: 'Operational',
        treatment: 'Mitigate',
        status: 'OPEN',
        nextReviewAt: '2026-05-01T00:00:00.000Z', // before the hydrated "now" -> overdue branch
        treatmentOwner: null,
        ownerUserId: 'user_1',
        owner: { id: 'user_1', name: 'Ada Lovelace', email: 'ada@acme.test' },
        asset: { name: 'Billing cluster' },
        controls: [{ id: 'c1' }, { id: 'c2' }],
        taskTotal: 2,
        taskDone: 2,
        sleAmount: 100000,
        aroAmount: 0.5,
        fairAle: null,
        residualLikelihood: 2,
        residualImpact: 3,
        residualScore: 6,
        ...overrides,
    };
}

const ROWS: RiskListItem[] = [
    makeRow(),
    makeRow({
        id: 'risk_2',
        key: null,
        title: 'Phishing wave',
        threat: 'Social engineering',
        likelihood: 2,
        impact: 2,
        inherentScore: 4,
        status: 'MITIGATED',
        treatment: null,
        owner: null,
        treatmentOwner: 'External vendor',
        asset: null,
        controls: [],
        taskTotal: 0,
        taskDone: 0,
        sleAmount: null,
        aroAmount: null,
        fairAle: null,
        residualLikelihood: null,
        residualImpact: null,
    }),
];

const PERMS = {
    canRead: true,
    canWrite: true,
    canAdmin: true,
    canAudit: true,
    canExport: true,
};

const T = {
    title: 'Risks',
    listDescription: 'Manage your risk register.',
    risksIdentified: 'risks identified',
    heatmap: 'Heatmap',
    histogram: 'Histogram',
    register: 'Register',
    addRisk: 'Risk',
    riskTitle: 'Title',
    asset: 'Asset',
    threat: 'Threat',
    score: 'Score',
    level: 'Level',
    treatment: 'Treatment',
    controlsCol: 'Controls',
    noRisks: 'No risks yet',
    low: 'Low',
    medium: 'Medium',
    high: 'High',
    critical: 'Critical',
    untreated: 'Untreated',
    heatmapTitle: 'Risk heatmap',
    totalRisks: 'Total risks',
    avgScore: 'Avg score',
    openRisks: 'Open risks',
    overdueReviews: 'Overdue reviews',
};

function withSWR(ui: React.ReactNode) {
    return (
        <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false, dedupingInterval: 0 }}>
            <TenantProvider value={TENANT_CTX}>
                <TooltipProvider>{ui}</TooltipProvider>
            </TenantProvider>
        </SWRConfig>
    );
}

function renderClient(rows: RiskListItem[], perms = PERMS) {
    mockSWR.mockReturnValue({
        data: { rows, truncated: false },
        isLoading: false,
        error: null,
        mutate: jest.fn(),
    });
    return render(
        withSWR(
            <RisksClient
                initialRisks={rows}
                matrixConfig={DEFAULT_RISK_MATRIX_CONFIG}
                tenantSlug="acme"
                permissions={perms}
                translations={T}
            />,
        ),
    );
}

describe('RisksClient render', () => {
    const origFetch = global.fetch;
    beforeEach(() => {
        // The mount fires effects that fetch risk-appetite + tail-percentiles
        // and the KPI-trends SWR fetcher hits the network. Stub all of them so
        // nothing throws and the failure-soft branches run.
        global.fetch = jest.fn().mockResolvedValue({
            ok: false,
            json: async () => ({}),
        }) as unknown as typeof fetch;
    });
    afterEach(() => {
        global.fetch = origFetch;
        mockSWR.mockReset();
    });

    it('renders the header, KPI cards, and the table rows with their cells', () => {
        renderClient(ROWS);

        // Page title / breadcrumb.
        expect(screen.getAllByText(/Risks/).length).toBeGreaterThan(0);
        // KPI card labels.
        expect(screen.getAllByText(/Total risks/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Open risks/i).length).toBeGreaterThan(0);

        // Row title cells.
        expect(screen.getAllByText(/Ransomware on the billing cluster/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Phishing wave/).length).toBeGreaterThan(0);
        // Asset cell (and the em-dash fallback for the second row's null asset).
        expect(screen.getAllByText(/Billing cluster/).length).toBeGreaterThan(0);
        // Owner display (name -> first-row owner; legacy treatmentOwner -> second).
        expect(screen.getAllByText(/Ada/).length).toBeGreaterThan(0);
        // Status badge label.
        expect(screen.getAllByText(/OPEN/).length).toBeGreaterThan(0);
    });

    it('shows the create button + import affordance when canWrite is true', () => {
        renderClient(ROWS);
        // Header "+ Risk" create trigger (bare noun per the action-button vocabulary).
        expect(screen.getByText('Risk')).toBeInTheDocument();
        expect(screen.getByLabelText(/Import risks/i)).toBeInTheDocument();
    });

    it('hides the create + import affordances when canWrite is false', () => {
        renderClient(ROWS, { ...PERMS, canWrite: false });
        expect(screen.queryByText('Risk')).not.toBeInTheDocument();
        expect(screen.queryByLabelText(/Import risks/i)).not.toBeInTheDocument();
    });

    it('opens the create modal from the header button', () => {
        renderClient(ROWS);
        fireEvent.click(screen.getByText('Risk'));
        // NewRiskModal mounts its title input once open.
        expect(document.querySelector('#risk-title')).not.toBeNull();
    });

    it('renders the first-run empty state with no risks', () => {
        renderClient([]);
        // RiskFirstRunEmpty renders some onboarding copy; the table body is empty.
        expect(screen.queryByText(/Ransomware on the billing cluster/)).not.toBeInTheDocument();
        // Header still present.
        expect(screen.getAllByText(/Risks/).length).toBeGreaterThan(0);
    });
});
