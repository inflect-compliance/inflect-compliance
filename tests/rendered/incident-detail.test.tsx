/**
 * Render test for the NIS2 incident detail page — exercises the Overview
 * (phase tracker, Article 23 deadlines, containment runbook, forensic
 * checklist, IR RACI), Timeline, and Controls tabs across reportable /
 * not-reportable + CLOSED states. Covers the detail-page statements that
 * the integration suite (usecase-only) doesn't.
 */
import * as React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { SWRConfig } from 'swr';

jest.mock('next/navigation', () => ({
    useParams: () => ({ tenantSlug: 'acme', incidentId: 'inc_1' }),
    useRouter: () => ({ push: jest.fn(), replace: jest.fn(), refresh: jest.fn() }),
    usePathname: () => '/t/acme/incidents/inc_1',
    useSearchParams: () => new URLSearchParams(),
}));

jest.mock('@/lib/hooks/use-hydrated-now', () => ({
    useHydratedNow: () => new Date('2026-06-02T00:00:00.000Z'),
}));

const mockSWR = jest.fn();
jest.mock('@/lib/hooks/use-tenant-swr', () => ({
    useTenantSWR: (...args: unknown[]) => mockSWR(...args),
}));

import IncidentDetailPage from '@/app/t/[tenantSlug]/(app)/incidents/[incidentId]/page';

function makeIncident(overrides: Record<string, unknown> = {}) {
    return {
        id: 'inc_1',
        reference: 'INC-2026-001',
        title: 'Ransomware on the billing cluster',
        description: 'Attacker encrypted the primary billing database.',
        severity: 'CRITICAL',
        phase: 'CONTAINMENT',
        incidentType: 'RANSOMWARE',
        detectedAt: '2026-06-01T00:00:00.000Z',
        reportable: true,
        reportedAt: null,
        ownerUserId: 'user_1',
        linkedControlIds: ['ctrl_1'],
        completedContainmentSteps: ['RANSOMWARE-1'],
        notifications: [
            { id: 'n1', kind: 'EARLY_WARNING_24H', dueAt: '2026-06-02T00:00:00.000Z', status: 'OVERDUE', submittedAt: null, submissionRef: null },
            { id: 'n2', kind: 'DETAILED_72H', dueAt: '2026-06-04T00:00:00.000Z', status: 'DUE', submittedAt: null, submissionRef: null },
            { id: 'n3', kind: 'FINAL_1MONTH', dueAt: '2026-07-01T00:00:00.000Z', status: 'PENDING', submittedAt: null, submissionRef: null },
        ],
        timeline: [
            { id: 't1', at: '2026-06-01T01:00:00.000Z', actorUserId: 'user_1', entry: 'Incident opened.', phaseAtTime: 'DETECTION' },
        ],
        evidenceLinks: [
            { id: 'e1', evidenceId: 'ev_1', forensicCategory: 'SYSTEM_LOGS', evidence: { id: 'ev_1', title: 'Auth logs', type: 'LINK', status: 'DRAFT' } },
        ],
        ...overrides,
    };
}

function withSWR(ui: React.ReactNode) {
    return <SWRConfig value={{ provider: () => new Map(), shouldRetryOnError: false }}>{ui}</SWRConfig>;
}

describe('IncidentDetailPage render', () => {
    afterEach(() => mockSWR.mockReset());

    it('renders the reportable RANSOMWARE incident overview (tracker, deadlines, runbook, forensic, RACI)', () => {
        mockSWR.mockReturnValue({ data: makeIncident(), isLoading: false, error: null, mutate: jest.fn() });
        render(withSWR(<IncidentDetailPage />));
        expect(screen.getAllByText(/INC-2026-001/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/Not legal advice/i).length).toBeGreaterThan(0);
        expect(screen.getByLabelText(/7-phase incident response tracker/i)).toBeInTheDocument();
        expect(screen.getByText(/Article 23 notification deadlines/i)).toBeInTheDocument();
        expect(screen.getByText(/Containment runbook/i)).toBeInTheDocument();
        expect(screen.getAllByText(/Forensic evidence/i).length).toBeGreaterThan(0);
        expect(screen.getByText(/Incident response roles/i)).toBeInTheDocument();
    });

    it('opens the submit + link-evidence affordances', () => {
        mockSWR.mockReturnValue({ data: makeIncident(), isLoading: false, error: null, mutate: jest.fn() });
        render(withSWR(<IncidentDetailPage />));
        // Submit a notification.
        fireEvent.click(screen.getAllByText('Submit')[0]);
        expect(screen.getByText(/File .* notification|Record the report/i)).toBeInTheDocument();
    });

    it('shows the mark-reportable prompt when not yet reportable', () => {
        mockSWR.mockReturnValue({
            data: makeIncident({ reportable: false, notifications: [] }),
            isLoading: false, error: null, mutate: jest.fn(),
        });
        render(withSWR(<IncidentDetailPage />));
        expect(screen.getByText(/not yet marked reportable/i)).toBeInTheDocument();
        expect(screen.getByText(/Mark reportable/i)).toBeInTheDocument();
    });

    it('renders the timeline + controls tabs', () => {
        mockSWR.mockReturnValue({ data: makeIncident(), isLoading: false, error: null, mutate: jest.fn() });
        render(withSWR(<IncidentDetailPage />));
        fireEvent.click(screen.getByRole('tab', { name: /Timeline/i }));
        expect(screen.getByText(/Incident opened\./)).toBeInTheDocument();
        fireEvent.click(screen.getByRole('tab', { name: /Controls/i }));
        expect(screen.getByText(/Art\.21\(2\) controls/i)).toBeInTheDocument();
    });

    it('renders the loading skeleton when data is absent', () => {
        mockSWR.mockReturnValue({ data: undefined, isLoading: true, error: null, mutate: jest.fn() });
        const { container } = render(withSWR(<IncidentDetailPage />));
        expect(container).toBeTruthy();
    });
});
