'use client';

/**
 * EU AI Act AI-System Registry — the register of each AI system a tenant
 * provides/deploys, with its risk-tier classification and obligation count.
 * A subpage of Risks (reached from the AI-risk area). Built on EntityListPage.
 */
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from '@/components/ui/icons/nucleo/plus';
import { Robot } from '@/components/ui/icons/nucleo/robot';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { FilterProvider, useFilterContext, useFilters } from '@/components/ui/filter';
import { createColumns } from '@/components/ui/table';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { buildAiSystemFilters, AI_SYSTEM_FILTER_KEYS } from './filter-defs';
import { NewAiSystemModal } from './NewAiSystemModal';

export interface AiSystemRow {
    id: string;
    name: string;
    provider: string | null;
    deploymentRole: string;
    riskTier: string;
    classificationClauseId: string | null;
    status: string;
    ownerUserId: string | null;
    createdAt: string;
    _count: { requirementLinks: number };
}

interface Props {
    initialRows: AiSystemRow[];
    tenantSlug: string;
    canWrite: boolean;
}

export const TIER_VARIANT: Record<string, StatusBadgeVariant> = {
    PROHIBITED: 'error',
    HIGH: 'error',
    LIMITED: 'warning',
    MINIMAL: 'neutral',
};

const ROLE_LABEL: Record<string, string> = { PROVIDER: 'Provider', DEPLOYER: 'Deployer' };

export function AiSystemsClient(props: Props) {
    const filterCtx = useFilterContext(buildAiSystemFilters(), [...AI_SYSTEM_FILTER_KEYS]);
    return (
        <FilterProvider value={filterCtx}>
            <AiSystemsInner {...props} />
        </FilterProvider>
    );
}

function AiSystemsInner({ initialRows, tenantSlug, canWrite }: Props) {
    const router = useRouter();
    const { state, hasActive } = useFilters();
    const [showNew, setShowNew] = useState(false);

    const rows = useMemo(() => {
        const tiers = (state.riskTier ?? []) as string[];
        return tiers.length ? initialRows.filter((r) => tiers.includes(r.riskTier)) : initialRows;
    }, [initialRows, state.riskTier]);

    const summary = useMemo(() => {
        const high = initialRows.filter((r) => r.riskTier === 'HIGH').length;
        const prohibited = initialRows.filter((r) => r.riskTier === 'PROHIBITED').length;
        return { total: initialRows.length, high, prohibited };
    }, [initialRows]);

    const columns = useMemo(
        () =>
            createColumns<AiSystemRow>([
                {
                    id: 'name',
                    header: 'System',
                    accessorFn: (r) => r.name,
                    cell: ({ row }) => (
                        <div className="min-w-0" data-testid={`ai-system-row-${row.original.id}`}>
                            <div className="truncate font-medium text-content-default">{row.original.name}</div>
                            {row.original.provider && (
                                <div className="truncate text-xs text-content-subtle">{row.original.provider}</div>
                            )}
                        </div>
                    ),
                },
                {
                    id: 'riskTier',
                    header: 'Risk tier',
                    accessorFn: (r) => r.riskTier,
                    cell: ({ row }) => (
                        <StatusBadge variant={TIER_VARIANT[row.original.riskTier] ?? 'neutral'}>
                            {row.original.riskTier}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'clause',
                    header: 'Basis',
                    accessorFn: (r) => r.classificationClauseId ?? '',
                    cell: ({ row }) => (
                        <span className="tabular-nums text-content-muted">
                            {row.original.classificationClauseId ?? '—'}
                        </span>
                    ),
                },
                {
                    id: 'role',
                    header: 'Role',
                    accessorFn: (r) => r.deploymentRole,
                    cell: ({ row }) => (
                        <span className="text-content-muted">{ROLE_LABEL[row.original.deploymentRole] ?? row.original.deploymentRole}</span>
                    ),
                },
                {
                    id: 'obligations',
                    header: 'Obligations',
                    accessorFn: (r) => r._count.requirementLinks,
                    cell: ({ row }) => (
                        <span className="tabular-nums text-content-muted">{row.original._count.requirementLinks}</span>
                    ),
                },
            ]),
        [],
    );

    return (
        <>
            <EntityListPage<AiSystemRow>
                header={{
                    back: { smart: true },
                    breadcrumbs: [
                        { label: 'Dashboard', href: `/t/${tenantSlug}/dashboard` },
                        { label: 'Risks', href: `/t/${tenantSlug}/risks` },
                        { label: 'AI Systems' },
                    ],
                    title: (
                        <>
                            <Robot className="inline-block mr-2 h-5 w-5 align-text-bottom" />
                            AI Systems
                        </>
                    ),
                    description: `${summary.total} AI system${summary.total === 1 ? '' : 's'} registered · ${summary.high} high-risk · ${summary.prohibited} prohibited. Each classified against the EU AI Act (Regulation (EU) 2024/1689) and mapped to its obligations.`,
                    actions: canWrite ? (
                        <Button variant="primary" icon={<Plus />} onClick={() => setShowNew(true)}>
                            System
                        </Button>
                    ) : undefined,
                }}
                filters={{ defs: buildAiSystemFilters() }}
                table={{
                    data: rows,
                    columns,
                    getRowId: (r) => r.id,
                    onRowClick: (row) => router.push(`/t/${tenantSlug}/risks/ai-systems/${row.original.id}`),
                    resourceName: (plural) => (plural ? 'systems' : 'system'),
                    emptyState: (
                        <EmptyState
                            icon={Robot}
                            title={hasActive ? 'No matching AI systems' : 'No AI systems registered yet'}
                            description={
                                hasActive
                                    ? 'Try clearing a filter.'
                                    : 'Register an AI system to classify its EU AI Act risk tier and map it to the obligations that tier requires.'
                            }
                        />
                    ),
                }}
            />
            {showNew && (
                <NewAiSystemModal
                    tenantSlug={tenantSlug}
                    onClose={() => setShowNew(false)}
                    onCreated={(id) => {
                        setShowNew(false);
                        router.push(`/t/${tenantSlug}/risks/ai-systems/${id}`);
                    }}
                />
            )}
        </>
    );
}
