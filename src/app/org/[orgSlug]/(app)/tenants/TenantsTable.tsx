'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Building2, Plus } from 'lucide-react';

import { ListPageShell } from '@/components/layout/ListPageShell';
import { DataTable, createColumns } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { buttonVariants } from '@/components/ui/button';
import { useOrgPermissions } from '@/lib/org-context-provider';
import type { TenantHealthRow, RagBadge } from '@/app-layer/schemas/portfolio';
import { Heading } from '@/components/ui/typography';

interface Props {
    rows: TenantHealthRow[];
    orgSlug: string;
}

const RAG_RANK: Record<RagBadge | 'PENDING', number> = {
    RED: 0,
    AMBER: 1,
    GREEN: 2,
    PENDING: 3,
};

function formatPercent(value: number | null): string {
    return value === null ? '—' : `${value.toFixed(1)}%`;
}

function RagPill({ rag }: { rag: RagBadge | null }) {
    if (rag === null) {
        return <StatusBadge variant="neutral">Pending</StatusBadge>;
    }
    const variant = rag === 'GREEN' ? 'success' : rag === 'AMBER' ? 'warning' : 'error';
    return <StatusBadge variant={variant}>{rag}</StatusBadge>;
}

export function TenantsTable({ rows, orgSlug }: Props) {
    const perms = useOrgPermissions();
    const [sortBy, setSortBy] = useState<string>('rag');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    const sorted = useMemo(() => {
        const copy = [...rows];
        copy.sort((a, b) => {
            const dir = sortOrder === 'asc' ? 1 : -1;
            switch (sortBy) {
                case 'name':
                    return dir * a.name.localeCompare(b.name);
                case 'coverage':
                    return dir * ((a.coveragePercent ?? -1) - (b.coveragePercent ?? -1));
                case 'openRisks':
                    return dir * ((a.openRisks ?? -1) - (b.openRisks ?? -1));
                case 'criticalRisks':
                    return dir * ((a.criticalRisks ?? -1) - (b.criticalRisks ?? -1));
                case 'overdueEvidence':
                    return dir * ((a.overdueEvidence ?? -1) - (b.overdueEvidence ?? -1));
                case 'rag':
                default: {
                    const ra = RAG_RANK[a.rag ?? 'PENDING'];
                    const rb = RAG_RANK[b.rag ?? 'PENDING'];
                    if (ra !== rb) return dir * (ra - rb);
                    return a.name.localeCompare(b.name);
                }
            }
        });
        return copy;
    }, [rows, sortBy, sortOrder]);

    const columns = useMemo(
        () =>
            createColumns<TenantHealthRow>([
                {
                    id: 'name',
                    header: 'Tenant',
                    cell: ({ row }) => (
                        <Link
                            href={row.original.drillDownUrl}
                            className="font-medium text-content-emphasis hover:text-content-info hover:underline"
                            data-testid={`org-tenant-link-${row.original.slug}`}
                        >
                            {row.original.name}
                        </Link>
                    ),
                },
                {
                    id: 'rag',
                    header: 'Health',
                    cell: ({ row }) => <RagPill rag={row.original.rag} />,
                },
                {
                    id: 'coverage',
                    header: 'Coverage',
                    cell: ({ row }) => (
                        <span className="tabular-nums text-content-emphasis">
                            {formatPercent(row.original.coveragePercent)}
                        </span>
                    ),
                },
                {
                    id: 'openRisks',
                    header: 'Open risks',
                    cell: ({ row }) => (
                        <span className="tabular-nums text-content-muted">
                            {row.original.openRisks ?? '—'}
                        </span>
                    ),
                },
                {
                    id: 'criticalRisks',
                    header: 'Critical',
                    cell: ({ row }) => (
                        <span className="tabular-nums text-content-muted">
                            {row.original.criticalRisks ?? '—'}
                        </span>
                    ),
                },
                {
                    id: 'overdueEvidence',
                    header: 'Overdue evidence',
                    cell: ({ row }) => (
                        <span className="tabular-nums text-content-muted">
                            {row.original.overdueEvidence ?? '—'}
                        </span>
                    ),
                },
                {
                    id: 'snapshotDate',
                    header: 'Latest snapshot',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-subtle">
                            {row.original.snapshotDate ?? 'Pending'}
                        </span>
                    ),
                },
            ]),
        [],
    );

    return (
        <ListPageShell>
            <ListPageShell.Header>
                <div className="flex items-end justify-between gap-4 flex-wrap">
                    <div>
                        <Heading level={1}>
                            Tenant Health
                        </Heading>
                        <p className="text-sm text-content-muted mt-1">
                            {rows.length} tenant{rows.length === 1 ? '' : 's'} linked to this organization
                        </p>
                    </div>
                    {perms.canManageTenants && (
                        <Link
                            href={`/org/${orgSlug}/tenants/new`}
                            className={buttonVariants({ variant: 'primary', size: 'sm' })}
                            data-testid="org-tenants-new-link"
                        >
                            <Plus className="w-4 h-4" aria-hidden="true" />
                            New tenant
                        </Link>
                    )}
                </div>
            </ListPageShell.Header>
            <ListPageShell.Body>
                <DataTable<TenantHealthRow>
                    fillBody
                    data={sorted}
                    columns={columns}
                    getRowId={(r) => r.tenantId}
                    sortableColumns={[
                        'name',
                        'rag',
                        'coverage',
                        'openRisks',
                        'criticalRisks',
                        'overdueEvidence',
                    ]}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(p) => {
                        if (p.sortBy) setSortBy(p.sortBy);
                        if (p.sortOrder) setSortOrder(p.sortOrder);
                    }}
                    resourceName={(plural) => (plural ? 'tenants' : 'tenant')}
                    emptyState={
                        <TableEmptyState
                            title="No tenants linked"
                            description="Add tenants to this organization to populate the portfolio view."
                            icon={<Building2 className="size-10" />}
                        />
                    }
                    data-testid="org-tenants-table"
                />
            </ListPageShell.Body>
        </ListPageShell>
    );
}
