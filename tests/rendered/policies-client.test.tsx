/**
 * Render test for the policies LIST client (`PoliciesClient`). Mounts the
 * component with mocked tenant SWR + navigation to exercise its render
 * path (header, KPI/filter chrome, table column cells, empty state,
 * permission-gated create affordance) — the statements the usecase-only
 * suites don't reach. Part of the global-coverage rendered-test sweep.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';

jest.mock('next/navigation', () => ({
    useParams: () => ({ tenantSlug: 'acme' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/t/acme/policies',
    useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/hooks/use-hydrated-now', () => ({
    useHydratedNow: () => new Date('2026-06-02T00:00:00.000Z'),
}));

const mockSWR = jest.fn();
jest.mock('@/lib/hooks/use-tenant-swr', () => ({
    useTenantSWR: (...args: unknown[]) => mockSWR(...args),
}));

import { PoliciesClient } from '@/app/t/[tenantSlug]/(app)/policies/PoliciesClient';
import { TenantProvider, type TenantContextValue } from '@/lib/tenant-context-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getPermissionsForRole } from '@/lib/permissions';

const TENANT_CTX: TenantContextValue = {
    userId: 'u1', tenantId: 't1', tenantSlug: 'acme', tenantName: 'Acme',
    role: 'OWNER', permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
    appPermissions: getPermissionsForRole('OWNER'),
};

type PolicyRow = {
    id: string;
    title: string;
    status: string;
    category: string | null;
    owner: { id: string; name: string | null; email: string | null } | null;
    currentVersion: { id: string; versionNumber: number } | null;
    lifecycleVersion: number;
    nextReviewAt: string | null;
    updatedAt: string;
};

function makeRow(over: Partial<PolicyRow> = {}): PolicyRow {
    return {
        id: 'pol_1',
        title: 'Access Control Policy',
        status: 'PUBLISHED',
        category: 'Security',
        owner: { id: 'u1', name: 'Alice Admin', email: 'alice@acme.com' },
        currentVersion: { id: 'v1', versionNumber: 3 },
        lifecycleVersion: 3,
        nextReviewAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
        ...over,
    };
}

const ROWS: PolicyRow[] = [
    makeRow(),
    makeRow({ id: 'pol_2', title: 'Data Retention Policy', status: 'DRAFT', category: null, owner: null, currentVersion: null, nextReviewAt: null }),
];

const PERMS = { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true };
const TRANSLATIONS = { title: 'Policies', listDescription: 'Manage your policies.' };

function withSWR(ui: React.ReactNode) {
    return (
        <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>
            <TenantProvider value={TENANT_CTX}>
                <TooltipProvider>{ui}</TooltipProvider>
            </TenantProvider>
        </SWRConfig>
    );
}

function renderClient(rows: PolicyRow[], perms = PERMS) {
    mockSWR.mockReturnValue({ data: { rows, truncated: false }, isLoading: false, error: null, mutate: jest.fn() });
    return render(
        withSWR(
            <PoliciesClient
                initialPolicies={rows}
                tenantSlug="acme"
                permissions={perms}
                translations={TRANSLATIONS}
            />,
        ),
    );
}

describe('PoliciesClient render', () => {
    afterEach(() => mockSWR.mockReset());

    it('renders the header + policy rows', () => {
        renderClient(ROWS);
        expect(screen.getAllByText(/Policies/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Access Control Policy/)).toBeInTheDocument();
        expect(screen.getByText(/Data Retention Policy/)).toBeInTheDocument();
    });

    it('renders the empty state with no policies', () => {
        renderClient([]);
        expect(screen.getAllByText(/Policies/i).length).toBeGreaterThan(0);
    });

    it('renders read-only (no write permission) without crashing', () => {
        renderClient(ROWS, { ...PERMS, canWrite: false });
        expect(screen.getByText(/Access Control Policy/)).toBeInTheDocument();
    });
});
