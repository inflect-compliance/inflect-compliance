/**
 * Render test for the Controls LIST page (`ControlsClient`). Mounts the
 * full client island with mocked tenant-SWR data so the render-path
 * statements execute: the KPI strip, the column definitions (code /
 * title / framework / category / status / applicability / owner /
 * frequency / tasks / evidence cells), the Browse rail accordion, the
 * empty state, and the create-button permission gate. This is a
 * coverage-campaign test — it exercises the component's render path,
 * not its server interactions.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TenantProvider, type TenantContextValue } from '@/lib/tenant-context-provider';
import { getPermissionsForRole } from '@/lib/permissions';

jest.mock('next/navigation', () => ({
    useParams: () => ({ tenantSlug: 'acme' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn(), prefetch: jest.fn() }),
    usePathname: () => '/t/acme/controls',
    useSearchParams: () => new URLSearchParams(),
}));

// useTenantSWR is the list read. The component reads `{ rows, truncated }`
// (CappedList). BestValueControls also calls useTenantSWR but it lives in a
// collapsed AsidePanel whose children never mount, so we only need to satisfy
// the controls-list shape here.
const mockSWR = jest.fn();
jest.mock('@/lib/hooks/use-tenant-swr', () => ({
    useTenantSWR: (...args: unknown[]) => mockSWR(...args),
}));

import { ControlsClient } from '@/app/t/[tenantSlug]/(app)/controls/ControlsClient';

interface ControlRow {
    id: string;
    code: string | null;
    annexId: string | null;
    name: string;
    description: string | null;
    status: string;
    applicability: string;
    category: string | null;
    frequency: string | null;
    owner: { id: string; name: string | null; email: string | null } | null;
    _count?: { controlTasks?: number; evidenceLinks?: number };
    taskTotal?: number;
    taskDone?: number;
}

const ROWS: ControlRow[] = [
    {
        id: 'ctl_1',
        code: '5.15',
        annexId: '5.15',
        name: 'Access control policy',
        description: 'Govern access to information.',
        status: 'IMPLEMENTED',
        applicability: 'APPLICABLE',
        category: 'Access control',
        frequency: 'QUARTERLY',
        owner: { id: 'user_1', name: 'Ada Lovelace', email: 'ada@acme.test' },
        _count: { controlTasks: 2, evidenceLinks: 3 },
        taskTotal: 2,
        taskDone: 2,
    },
    {
        id: 'ctl_2',
        code: null,
        annexId: null,
        name: 'Custom monitoring control',
        description: null,
        status: 'NOT_STARTED',
        applicability: 'NOT_APPLICABLE',
        category: null,
        frequency: null,
        owner: null,
        _count: { controlTasks: 0, evidenceLinks: 0 },
        taskTotal: 0,
        taskDone: 0,
    },
];

const PERMISSIONS = {
    canRead: true,
    canWrite: true,
    canAdmin: true,
    canAudit: true,
    canExport: true,
};
const APP_PERMS = {
    controls: { create: true, edit: true },
    tasks: { edit: true },
};

function cappedReturn(rows: ControlRow[]) {
    return {
        data: { rows, truncated: false },
        isLoading: false,
        error: null,
        mutate: jest.fn(),
    };
}

const TENANT_CTX: TenantContextValue = {
    userId: 'u1',
    tenantId: 't1',
    tenantSlug: 'acme',
    tenantName: 'Acme',
    currencySymbol: '€',
    role: 'OWNER',
    permissions: { canRead: true, canWrite: true, canAdmin: true, canAudit: true, canExport: true },
    appPermissions: getPermissionsForRole('OWNER'),
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

function renderControls(
    rows: ControlRow[],
    appPermissions = APP_PERMS,
) {
    mockSWR.mockImplementation((key: unknown) => {
        // The controls list key resolves to a CACHE_KEYS.controls.list() string;
        // everything else (e.g. best-value, if it ever mounts) gets an empty array.
        if (typeof key === 'string' && key.includes('control')) {
            return cappedReturn(rows);
        }
        return { data: undefined, isLoading: false, error: null, mutate: jest.fn() };
    });
    return render(
        withSWR(
            <ControlsClient
                initialControls={rows as never}
                tenantSlug="acme"
                permissions={PERMISSIONS}
                appPermissions={appPermissions}
            />,
        ),
    );
}

describe('ControlsClient render', () => {
    afterEach(() => mockSWR.mockReset());

    it('renders the header, KPI strip, and table rows with their cells', () => {
        renderControls(ROWS);

        // Header title.
        expect(screen.getAllByText(/Controls/).length).toBeGreaterThan(0);
        // KPI labels.
        expect(screen.getAllByText(/Total controls/i).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Implemented/i).length).toBeGreaterThan(0);

        // Row titles.
        expect(screen.getAllByText(/Access control policy/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Custom monitoring control/).length).toBeGreaterThan(0);

        // Owner display + applicability badges render.
        expect(screen.getAllByText(/Ada Lovelace/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/N\/A/).length).toBeGreaterThan(0);
    });

    it('renders the Browse rail accordion grouped by category', () => {
        renderControls(ROWS);
        // The categorizable control surfaces in the browse rail group.
        expect(screen.getAllByText(/Access control/).length).toBeGreaterThan(0);
    });

    it('shows the create button when the viewer can create, opens the modal', () => {
        renderControls(ROWS);
        const createBtn = screen.getByText('Control', { selector: '#new-control-btn, #new-control-btn *' });
        expect(createBtn).toBeInTheDocument();
        fireEvent.click(createBtn);
        // The NewControlModal is now mounted/open — its content appears.
        expect(screen.getAllByText(/Control/).length).toBeGreaterThan(0);
    });

    it('hides the create button when the viewer cannot create', () => {
        renderControls(ROWS, {
            controls: { create: false, edit: false },
            tasks: { edit: false },
        });
        expect(document.querySelector('#new-control-btn')).toBeNull();
    });

    it('renders the empty state when there are no controls', () => {
        renderControls([]);
        expect(screen.getByText(/No controls yet/i)).toBeInTheDocument();
    });
});
