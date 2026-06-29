'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { Button } from '@/components/ui/button';
import { Plus } from '@/components/ui/icons/nucleo';
import { createColumns } from '@/components/ui/table';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { EmptyState } from '@/components/ui/empty-state';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
} from '@/components/ui/filter';
import { formatDate } from '@/lib/format-date';
import {
    incidentFilterDefs,
    INCIDENT_FILTER_KEYS,
    SEVERITY_LABELS,
    PHASE_LABELS,
} from './filter-defs';
import { NewIncidentModal } from './NewIncidentModal';

export interface IncidentNotificationLite {
    kind: 'EARLY_WARNING_24H' | 'DETAILED_72H' | 'FINAL_1MONTH';
    dueAt: string;
    status: 'PENDING' | 'DUE' | 'OVERDUE' | 'SUBMITTED' | 'NOT_REQUIRED';
}

export interface IncidentRow {
    id: string;
    reference: string;
    title: string;
    severity: keyof typeof SEVERITY_LABELS;
    phase: keyof typeof PHASE_LABELS;
    incidentType: string;
    detectedAt: string;
    reportable: boolean;
    ownerUserId: string | null;
    createdAt: string;
    notifications: IncidentNotificationLite[];
}

interface IncidentsClientProps {
    initialIncidents: IncidentRow[];
    tenantSlug: string;
    canManage: boolean;
}

const SEVERITY_TONE: Record<string, StatusBadgeVariant> = {
    LOW: 'neutral',
    MEDIUM: 'info',
    HIGH: 'warning',
    CRITICAL: 'error',
};

const DEADLINE_TONE: Record<string, StatusBadgeVariant> = {
    PENDING: 'neutral',
    DUE: 'warning',
    OVERDUE: 'error',
    SUBMITTED: 'success',
    NOT_REQUIRED: 'neutral',
};

const KIND_SHORT: Record<string, string> = {
    EARLY_WARNING_24H: '24h',
    DETAILED_72H: '72h',
    FINAL_1MONTH: '1mo',
};

/** The earliest still-open (non-submitted, non-NA) notification. */
export function nextOpenDeadline(
    notifications: IncidentNotificationLite[],
): IncidentNotificationLite | null {
    const open = notifications
        .filter((n) => n.status !== 'SUBMITTED' && n.status !== 'NOT_REQUIRED')
        .sort((a, b) => new Date(a.dueAt).getTime() - new Date(b.dueAt).getTime());
    return open[0] ?? null;
}

export function IncidentsClient(props: IncidentsClientProps) {
    const filterCtx = useFilterContext([...incidentFilterDefs.filters], [
        ...INCIDENT_FILTER_KEYS,
    ]);
    return (
        <FilterProvider value={filterCtx}>
            <IncidentsPageInner {...props} />
        </FilterProvider>
    );
}

function IncidentsPageInner({ initialIncidents, tenantSlug, canManage }: IncidentsClientProps) {
    const router = useRouter();
    const [isCreateOpen, setIsCreateOpen] = useState(false);

    const query = useTenantSWR<IncidentRow[]>(CACHE_KEYS.incidents.list(), {
        fallbackData: initialIncidents,
    });
    const incidents = query.data ?? initialIncidents;
    const { state, search } = useFilters();

    // Client-side filtering (the API returns the bounded per-tenant list).
    const filtered = useMemo(() => {
        const q = (search ?? '').trim().toLowerCase();
        const sev = state.severity ?? [];
        const ph = state.phase ?? [];
        const rep = state.reportable ?? [];
        return incidents.filter((i) => {
            if (q && !`${i.reference} ${i.title}`.toLowerCase().includes(q)) return false;
            if (sev.length > 0 && !sev.includes(i.severity)) return false;
            if (ph.length > 0 && !ph.includes(i.phase)) return false;
            if (rep.length > 0) {
                const want = rep.includes('yes');
                const notWant = rep.includes('no');
                if (want && !notWant && !i.reportable) return false;
                if (notWant && !want && i.reportable) return false;
            }
            return true;
        });
    }, [incidents, state, search]);

    // KPI summary — open incidents, reportable, deadlines due/overdue.
    const openCount = incidents.filter((i) => i.phase !== 'CLOSED').length;
    const reportableCount = incidents.filter((i) => i.reportable).length;
    const dueOrOverdueCount = incidents.filter((i) =>
        i.notifications.some((n) => n.status === 'DUE' || n.status === 'OVERDUE'),
    ).length;

    const columns = useMemo(
        () =>
            createColumns<IncidentRow>([
                {
                    accessorKey: 'reference',
                    header: 'Reference',
                    cell: ({ getValue }) => (
                        <span className="font-medium text-content-emphasis">
                            {String(getValue() ?? '')}
                        </span>
                    ),
                },
                { accessorKey: 'title', header: 'Title' },
                {
                    accessorKey: 'severity',
                    header: 'Severity',
                    cell: ({ getValue }) => {
                        const s = String(getValue() ?? '');
                        return (
                            <StatusBadge variant={SEVERITY_TONE[s] ?? 'neutral'}>
                                {SEVERITY_LABELS[s as keyof typeof SEVERITY_LABELS] ?? s}
                            </StatusBadge>
                        );
                    },
                },
                {
                    accessorKey: 'phase',
                    header: 'Phase',
                    cell: ({ getValue }) => {
                        const p = String(getValue() ?? '');
                        return (
                            <StatusBadge variant="neutral">
                                {PHASE_LABELS[p as keyof typeof PHASE_LABELS] ?? p}
                            </StatusBadge>
                        );
                    },
                },
                {
                    id: 'nextDeadline',
                    header: 'Next deadline',
                    cell: ({ row }) => {
                        const next = nextOpenDeadline(row.original.notifications);
                        if (!next) return <span className="text-content-muted">—</span>;
                        return (
                            <span className="inline-flex items-center gap-tight">
                                <StatusBadge variant={DEADLINE_TONE[next.status] ?? 'neutral'}>
                                    {KIND_SHORT[next.kind] ?? next.kind}
                                </StatusBadge>
                                <span className="text-xs text-content-muted">
                                    {formatDate(next.dueAt)}
                                </span>
                            </span>
                        );
                    },
                },
                {
                    accessorKey: 'ownerUserId',
                    header: 'Owner',
                    cell: ({ getValue }) => (
                        <span className="text-content-muted">
                            {getValue() ? 'Assigned' : '—'}
                        </span>
                    ),
                },
            ]),
        [],
    );

    return (
        <EntityListPage<IncidentRow>
            header={{
                back: { smart: true },
                breadcrumbs: [
                    { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard` },
                    { label: 'Internal Audits', href: `/t/${tenantSlug}/audits` },
                    { label: 'Incidents' },
                ],
                title: 'Incidents',
                count: `${incidents.length} incident${incidents.length === 1 ? '' : 's'}`,
                description:
                    'NIS2 Article 23 incident response. Reporting thresholds + deadlines are operational aids — they are not legal advice; your DPO/legal owns the determination.',
                actions: canManage ? (
                    <Button
                        variant="primary"
                        icon={<Plus />}
                        onClick={() => setIsCreateOpen(true)}
                        id="new-incident-btn"
                    >
                        Incident
                    </Button>
                ) : undefined,
            }}
            kpis={
                <div className="grid grid-cols-1 gap-default sm:grid-cols-3">
                    <KpiFilterCard label="Open incidents" value={openCount} />
                    <KpiFilterCard label="Reportable" value={reportableCount} />
                    <KpiFilterCard
                        label="Deadlines due / overdue"
                        value={dueOrOverdueCount}
                        tone={dueOrOverdueCount > 0 ? 'critical' : 'default'}
                    />
                </div>
            }
            filters={{
                defs: [...incidentFilterDefs.filters],
                searchId: 'incidents-search',
                searchPlaceholder: 'Search incidents…',
            }}
            table={{
                data: filtered,
                columns,
                loading: query.isLoading && !query.data,
                getRowId: (row: IncidentRow) => row.id,
                onRowClick: (row) =>
                    router.push(`/t/${tenantSlug}/incidents/${row.original.id}`),
                emptyState: (
                    <EmptyState
                        size="sm"
                        variant="no-records"
                        title="No incidents yet"
                        description="When a security incident is detected, open it here to start the NIS2 Article 23 response clock."
                    />
                ),
            }}
        >
            {isCreateOpen && (
                <NewIncidentModal
                    open={isCreateOpen}
                    onClose={() => setIsCreateOpen(false)}
                    tenantSlug={tenantSlug}
                    onCreated={async (id) => {
                        setIsCreateOpen(false);
                        await query.mutate();
                        router.push(`/t/${tenantSlug}/incidents/${id}`);
                    }}
                />
            )}
        </EntityListPage>
    );
}
