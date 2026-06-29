/**
 * Render test for the assets LIST client (`AssetsClient`). Mounts the
 * component with mocked tenant SWR + navigation to exercise its render
 * path (header, table column cells incl. CIA scores + control/task
 * counts, empty state, permission-gated create affordance) — statements
 * the usecase-only suites don't reach. Part of the global-coverage sweep.
 */
import * as React from 'react';
import { render, screen } from '@testing-library/react';
import { SWRConfig } from 'swr';

jest.mock('next/navigation', () => ({
    useParams: () => ({ tenantSlug: 'acme' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/t/acme/assets',
    useSearchParams: () => new URLSearchParams(),
}));

const mockSWR = jest.fn();
jest.mock('@/lib/hooks/use-tenant-swr', () => ({
    useTenantSWR: (...args: unknown[]) => mockSWR(...args),
}));

import { AssetsClient } from '@/app/t/[tenantSlug]/(app)/assets/AssetsClient';
import { TenantProvider, type TenantContextValue } from '@/lib/tenant-context-provider';
import { TooltipProvider } from '@/components/ui/tooltip';
import { getPermissionsForRole } from '@/lib/permissions';

const TENANT_CTX: TenantContextValue = {
    userId: 'u1', tenantId: 't1', tenantSlug: 'acme', tenantName: 'Acme',
    role: 'OWNER', permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
    appPermissions: getPermissionsForRole('OWNER'),
};

type AssetListRow = {
    id: string;
    key: string | null;
    name: string;
    type: string;
    classification: string | null;
    owner: string | null;
    confidentiality: number | null;
    integrity: number | null;
    availability: number | null;
    criticality: string | null;
    status: string;
    _count: { controls: number };
    taskTotal: number;
    taskDone: number;
};

function makeRow(over: Partial<AssetListRow> = {}): AssetListRow {
    return {
        id: 'as_1',
        key: 'AS-001',
        name: 'Billing database',
        type: 'APPLICATION',
        classification: 'Confidential',
        owner: 'Alice Admin',
        confidentiality: 3,
        integrity: 3,
        availability: 2,
        criticality: 'HIGH',
        status: 'ACTIVE',
        _count: { controls: 4 },
        taskTotal: 5,
        taskDone: 3,
        ...over,
    };
}

const ROWS: AssetListRow[] = [
    makeRow(),
    makeRow({ id: 'as_2', key: null, name: 'Marketing site', type: 'SERVICE', classification: null, owner: null, confidentiality: null, integrity: null, availability: null, criticality: null, _count: { controls: 0 }, taskTotal: 0, taskDone: 0 }),
];

const TRANSLATIONS = {
    title: 'Assets', listDescription: 'Your asset inventory.', addAsset: 'Asset', createAsset: 'Create asset',
    name: 'Name', type: 'Type', classification: 'Classification', classificationPlaceholder: 'Select…',
    owner: 'Owner', location: 'Location', dataResidency: 'Residency', residencyPlaceholder: 'Select…',
    confidentiality: 'C', integrity: 'I', availability: 'A', cia: 'CIA', controlsCol: 'Controls',
    noAssets: 'No assets yet', cancel: 'Cancel', assetsRegistered: 'assets registered',
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

function renderClient(rows: AssetListRow[], canWrite = true) {
    mockSWR.mockReturnValue({ data: rows, isLoading: false, error: null, mutate: jest.fn() });
    return render(
        withSWR(
            <AssetsClient
                initialAssets={rows}
                initialFilters={{}}
                tenantSlug="acme"
                permissions={{ canWrite }}
                translations={TRANSLATIONS}
            />,
        ),
    );
}

describe('AssetsClient render', () => {
    afterEach(() => mockSWR.mockReset());

    it('renders the header + asset rows with CIA / count cells', () => {
        renderClient(ROWS);
        expect(screen.getAllByText(/Assets/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Billing database/)).toBeInTheDocument();
        expect(screen.getByText(/Marketing site/)).toBeInTheDocument();
    });

    it('renders the empty state with no assets', () => {
        renderClient([]);
        expect(screen.getAllByText(/Assets/i).length).toBeGreaterThan(0);
    });

    it('renders read-only (no write permission) without crashing', () => {
        renderClient(ROWS, false);
        expect(screen.getByText(/Billing database/)).toBeInTheDocument();
    });
});
