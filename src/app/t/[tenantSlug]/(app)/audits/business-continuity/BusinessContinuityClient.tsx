'use client';

/**
 * Business Continuity register — Business Impact Analyses ordered by their
 * derived recovery priority ("what comes back first"). A subpage of the
 * Internal Audit area (reached via the "Business Continuity" pill beside
 * Incidents). Built on EntityListPage + FilterToolbar + DataTable.
 */
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from '@/components/ui/icons/nucleo/plus';
import { LifeRing } from '@/components/ui/icons/nucleo/life-ring';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { FilterProvider, useFilterContext, useFilters } from '@/components/ui/filter';
import { createColumns } from '@/components/ui/table';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDate } from '@/lib/format-date';
import { buildBiaFilters, BIA_FILTER_KEYS } from './filter-defs';
import { NewBiaModal } from './NewBiaModal';

export interface BiaRow {
    id: string;
    name: string;
    criticality: string;
    rtoHours: number | null;
    rpoHours: number | null;
    mtpdHours: number | null;
    reviewedAt: string | null;
    processNode: { id: string; label: string } | null;
    ownerUser: { id: string; name: string | null; email: string } | null;
    recovery: { rank: number; rationale: string } | null;
}

interface Props {
    initialRows: BiaRow[];
    tenantSlug: string;
    canWrite: boolean;
}

const CRITICALITY_VARIANT: Record<string, StatusBadgeVariant> = {
    CRITICAL: 'error',
    HIGH: 'error',
    MEDIUM: 'warning',
    LOW: 'info',
};

const REVIEW_STALE_DAYS = 365;

function isReviewOverdue(reviewedAt: string | null): boolean {
    if (!reviewedAt) return true;
    return Date.now() - new Date(reviewedAt).getTime() > REVIEW_STALE_DAYS * 86_400_000;
}

const hrs = (v: number | null) => (v != null ? `${v}h` : '—');

export function BusinessContinuityClient(props: Props) {
    const filterCtx = useFilterContext(buildBiaFilters(), [...BIA_FILTER_KEYS]);
    return (
        <FilterProvider value={filterCtx}>
            <BusinessContinuityInner {...props} />
        </FilterProvider>
    );
}

function BusinessContinuityInner({ initialRows, tenantSlug, canWrite }: Props) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { state, hasActive } = useFilters();
    const [showNew, setShowNew] = useState(false);
    // Canvas "Add BIA" deep-link — ?newProcessNodeId=<id> auto-opens the
    // create modal prefilled with the process node.
    const [prefillNode, setPrefillNode] = useState<string | undefined>(undefined);
    useEffect(() => {
        const p = searchParams?.get('newProcessNodeId');
        if (p) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setPrefillNode(p);
            setShowNew(true);
            const next = new URLSearchParams(searchParams.toString());
            next.delete('newProcessNodeId');
            const qs = next.toString();
            router.replace(`/t/${tenantSlug}/audits/business-continuity${qs ? `?${qs}` : ''}`, { scroll: false });
        }
        // First-mount only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const rows = useMemo(() => {
        const crits = (state.criticality ?? []) as string[];
        return initialRows.filter((r) => (crits.length ? crits.includes(r.criticality) : true));
    }, [initialRows, state.criticality]);

    const summary = useMemo(() => {
        const critical = initialRows.filter((r) => r.criticality === 'CRITICAL').length;
        const overdue = initialRows.filter((r) => isReviewOverdue(r.reviewedAt)).length;
        return { total: initialRows.length, critical, overdue };
    }, [initialRows]);

    const columns = useMemo(
        () =>
            createColumns<BiaRow>([
                {
                    id: 'recovery',
                    header: '#',
                    accessorFn: (r) => r.recovery?.rank ?? 999,
                    cell: ({ row }) => (
                        <span className="tabular-nums font-medium text-content-default">
                            {row.original.recovery ? row.original.recovery.rank : '—'}
                        </span>
                    ),
                },
                {
                    id: 'name',
                    header: 'Process',
                    accessorFn: (r) => r.name,
                    cell: ({ row }) => (
                        <div className="min-w-0" data-testid={`bia-row-${row.original.id}`}>
                            <div className="truncate font-medium text-content-default">{row.original.name}</div>
                            {row.original.processNode && (
                                <div className="truncate text-xs text-content-subtle">{row.original.processNode.label}</div>
                            )}
                        </div>
                    ),
                },
                {
                    id: 'criticality',
                    header: 'Criticality',
                    accessorFn: (r) => r.criticality,
                    cell: ({ row }) => (
                        <StatusBadge variant={CRITICALITY_VARIANT[row.original.criticality] ?? 'neutral'}>
                            {row.original.criticality}
                        </StatusBadge>
                    ),
                },
                { id: 'rto', header: 'RTO', accessorFn: (r) => r.rtoHours ?? -1, cell: ({ row }) => <span className="tabular-nums text-content-muted">{hrs(row.original.rtoHours)}</span> },
                { id: 'rpo', header: 'RPO', accessorFn: (r) => r.rpoHours ?? -1, cell: ({ row }) => <span className="tabular-nums text-content-muted">{hrs(row.original.rpoHours)}</span> },
                { id: 'mtpd', header: 'MTPD', accessorFn: (r) => r.mtpdHours ?? -1, cell: ({ row }) => <span className="tabular-nums text-content-muted">{hrs(row.original.mtpdHours)}</span> },
                {
                    id: 'owner',
                    header: 'Owner',
                    accessorFn: (r) => r.ownerUser?.name ?? r.ownerUser?.email ?? '',
                    cell: ({ row }) => (
                        <span className="text-content-muted">
                            {row.original.ownerUser ? row.original.ownerUser.name ?? row.original.ownerUser.email : '—'}
                        </span>
                    ),
                },
                {
                    id: 'reviewed',
                    header: 'Reviewed',
                    accessorFn: (r) => r.reviewedAt ?? '',
                    cell: ({ row }) =>
                        isReviewOverdue(row.original.reviewedAt) ? (
                            <StatusBadge variant="warning">Review overdue</StatusBadge>
                        ) : (
                            <span className="text-content-muted">{formatDate(row.original.reviewedAt!)}</span>
                        ),
                },
            ]),
        [],
    );

    return (
        <>
            <EntityListPage<BiaRow>
                header={{
                    back: { smart: true },
                    breadcrumbs: [
                        { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard` },
                        { label: 'Internal Audit', href: `/t/${tenantSlug}/audits` },
                        { label: 'Business Continuity' },
                    ],
                    title: (
                        <>
                            <LifeRing className="inline-block mr-2 h-5 w-5 align-text-bottom" />
                            Business Continuity
                        </>
                    ),
                    description: `${summary.total} process${summary.total === 1 ? '' : 'es'} analysed · ${summary.critical} critical · ${summary.overdue} review${summary.overdue === 1 ? '' : 's'} overdue. Ordered by recovery priority — what comes back first.`,
                    actions: canWrite ? (
                        <Button variant="primary" icon={<Plus />} onClick={() => { setPrefillNode(undefined); setShowNew(true); }}>
                            BIA
                        </Button>
                    ) : undefined,
                }}
                filters={{ defs: buildBiaFilters() }}
                table={{
                    data: rows,
                    columns,
                    getRowId: (r) => r.id,
                    onRowClick: (row) => router.push(`/t/${tenantSlug}/audits/business-continuity/${row.original.id}`),
                    resourceName: (plural) => (plural ? 'analyses' : 'analysis'),
                    emptyState: (
                        <EmptyState
                            icon={LifeRing}
                            title={hasActive ? 'No matching analyses' : 'No business impact analyses yet'}
                            description={
                                hasActive
                                    ? 'Try clearing a filter.'
                                    : 'Analyse a critical process — set its RTO/RPO/MTPD and criticality — to satisfy NIS2 Art.21(2)(c) business continuity.'
                            }
                        />
                    ),
                }}
            />
            {showNew && (
                <NewBiaModal
                    tenantSlug={tenantSlug}
                    processNodeId={prefillNode}
                    onClose={() => {
                        setShowNew(false);
                        setPrefillNode(undefined);
                    }}
                    onCreated={(id) => {
                        setShowNew(false);
                        setPrefillNode(undefined);
                        router.push(`/t/${tenantSlug}/audits/business-continuity/${id}`);
                    }}
                />
            )}
        </>
    );
}
