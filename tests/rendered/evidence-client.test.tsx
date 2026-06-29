/**
 * Render test for the Evidence LIST page client island (`EvidenceClient`).
 *
 * The evidence usecase / repo suites cover the data layer; this exercises
 * the large untested render path: the KPI strip, retention tabs, the
 * full column factory (title / type / control / folder / retention /
 * freshness / status / owner + the icon-only edit / archive / download /
 * review action cells), the empty state, and the create-button gate.
 *
 * Resilient assertions only — `getAllByText` + regex, never exact counts —
 * because column chrome and KPI labels share substrings.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';

jest.mock('next/navigation', () => ({
    useParams: () => ({ tenantSlug: 'acme' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/t/acme/evidence',
    useSearchParams: () => new URLSearchParams(),
}));

const mockSWR = jest.fn();
jest.mock('@/lib/hooks/use-tenant-swr', () => ({
    useTenantSWR: (...args: unknown[]) => mockSWR(...args),
}));

import { EvidenceClient } from '@/app/t/[tenantSlug]/(app)/evidence/EvidenceClient';
import { TenantProvider, type TenantContextValue } from '@/lib/tenant-context-provider';
import { TooltipProvider } from '@/components/ui/tooltip';

const TENANT_CTX: TenantContextValue = {
    userId: 'user_1',
    tenantId: 'tnt_1',
    tenantSlug: 'acme',
    tenantName: 'Acme',
    role: 'ADMIN' as TenantContextValue['role'],
    permissions: {
        canRead: true,
        canWrite: true,
        canAdmin: true,
        canAudit: true,
        canExport: true,
    },
    appPermissions: {} as TenantContextValue['appPermissions'],
};

// ─── Fixtures ───────────────────────────────────────────────────────

type EvidenceRow = Parameters<typeof EvidenceClient>[0]['initialEvidence'][number];

function makeRow(overrides: Partial<EvidenceRow> = {}): EvidenceRow {
    return {
        id: 'ev_1',
        title: 'SOC 2 access-review export',
        type: 'FILE',
        status: 'DRAFT',
        fileName: 'access-review.pdf',
        owner: 'Alice Owner',
        ownerUserId: 'user_1',
        folder: 'Audits/2026',
        isArchived: false,
        expiredAt: null,
        deletedAt: null,
        retentionUntil: '2030-01-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        dateCollected: '2026-05-01T00:00:00.000Z',
        fileRecordId: 'file_1',
        content: 'Exported from the IdP admin console.',
        control: { id: 'ctl_1', name: 'Access reviews', annexId: 'A.9.2.5' },
        fileRecord: { id: 'file_1', mimeType: 'application/pdf' },
        ...overrides,
    } as EvidenceRow;
}

const ROWS: EvidenceRow[] = [
    makeRow(),
    makeRow({
        id: 'ev_2',
        title: 'Penetration test attestation',
        type: 'LINK',
        status: 'SUBMITTED',
        fileName: null,
        owner: null,
        ownerUserId: null,
        folder: null,
        retentionUntil: null,
        fileRecordId: null,
        content: null,
        control: null,
        fileRecord: null,
    }),
];

const CONTROLS = [
    { id: 'ctl_1', name: 'Access reviews', code: 'AC-2', annexId: 'A.9.2.5' },
];

const PERMS = {
    canRead: true,
    canWrite: true,
    canAdmin: true,
    canAudit: true,
    canExport: true,
};

// Every translation key the column factory + header reads.
const T: Record<string, string> = {
    title: 'Evidence',
    listDescription: 'Proof your controls work in practice.',
    addEvidence: 'Evidence',
    noEvidence: 'No evidence yet',
    evidenceTitle: 'Title',
    type: 'Type',
    control: 'Control',
    status: 'Status',
    ownerLabel: 'Owner',
    actions: 'Actions',
    draft: 'Draft',
    submitted: 'Submitted',
    approved: 'Approved',
    rejected: 'Rejected',
    submitForReview: 'Submit for review',
    approveEvidence: 'Approve',
    rejectEvidence: 'Reject',
};

function withSWR(ui: React.ReactNode) {
    return (
        <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
            <TenantProvider value={TENANT_CTX}>
                <TooltipProvider>{ui}</TooltipProvider>
            </TenantProvider>
        </SWRConfig>
    );
}

function renderClient(rows: EvidenceRow[], perms = PERMS) {
    mockSWR.mockReturnValue({
        data: { rows, truncated: false },
        isLoading: false,
        error: null,
        mutate: jest.fn(),
    });
    return render(
        withSWR(
            <EvidenceClient
                initialEvidence={rows}
                initialControls={CONTROLS}
                tenantSlug="acme"
                permissions={perms}
                translations={T}
            />,
        ),
    );
}

describe('EvidenceClient render', () => {
    const origFetch = global.fetch;
    beforeEach(() => {
        // Some children (KPI trends, modals on open) fetch — stub so the
        // SWR fetcher resolves quietly instead of throwing ReferenceError.
        global.fetch = jest.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ dataPoints: [] }),
        }) as unknown as typeof fetch;
    });
    afterEach(() => {
        global.fetch = origFetch;
        mockSWR.mockReset();
    });

    it('renders the header, KPI strip, retention tabs, and table rows', () => {
        renderClient(ROWS);

        // Page heading + description.
        expect(screen.getAllByText(/Evidence/).length).toBeGreaterThan(0);

        // KPI strip labels.
        expect(screen.getByText(/Total evidence/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Draft/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Approved/).length).toBeGreaterThan(0);

        // Retention tab bar.
        expect(screen.getByText(/Active \(/)).toBeInTheDocument();
        expect(screen.getByText(/Expiring \(/)).toBeInTheDocument();
        expect(screen.getByText(/Archived \(/)).toBeInTheDocument();

        // Row content — title cell + folder cell + control cell.
        expect(screen.getByText(/SOC 2 access-review export/)).toBeInTheDocument();
        expect(screen.getByText(/Penetration test attestation/)).toBeInTheDocument();
        expect(screen.getByText(/Audits\/2026/)).toBeInTheDocument();
        expect(screen.getAllByText(/Access reviews/).length).toBeGreaterThan(0);
    });

    it('shows the create button when canWrite is true', () => {
        renderClient(ROWS);
        expect(document.getElementById('add-evidence-btn')).toBeInTheDocument();
    });

    it('hides the create button when canWrite is false', () => {
        renderClient(ROWS, { ...PERMS, canWrite: false });
        expect(document.getElementById('add-evidence-btn')).not.toBeInTheDocument();
    });

    it('renders the no-records empty state with an empty list', () => {
        renderClient([]);
        expect(screen.getByText(/No evidence yet/i)).toBeInTheDocument();
    });

    it('fires KPI-card + retention-tab + edit-action click handlers without throwing', () => {
        renderClient(ROWS);

        // KPI card toggle (status filter) handler.
        fireEvent.click(screen.getByText(/Total evidence/i));
        // Retention tab setters.
        fireEvent.click(document.getElementById('tab-expiring')!);
        fireEvent.click(document.getElementById('tab-archived')!);
        // Row edit icon — opens the edit modal (sets editInitial state).
        const editBtn = document.getElementById('edit-evidence-ev_1');
        if (editBtn) fireEvent.click(editBtn);

        // The page is still mounted after the interactions.
        expect(screen.getAllByText(/Evidence/).length).toBeGreaterThan(0);
    });
});
