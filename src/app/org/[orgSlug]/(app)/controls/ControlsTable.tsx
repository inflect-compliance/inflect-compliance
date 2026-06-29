'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { ShieldCheck } from 'lucide-react';

import { ListPageShell } from '@/components/layout/ListPageShell';
import { DataTable, createColumns, sortRowsByDisplay, type SortAccessors } from '@/components/ui/table';
import { TableEmptyState } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { Button } from '@/components/ui/button';
import { useCursorPagination } from '@/components/ui/hooks';
import { formatDate } from '@/lib/format-date';
import type { NonPerformingControlRow } from '@/app-layer/schemas/portfolio';
import { Heading } from '@/components/ui/typography';

interface Props {
    rows: NonPerformingControlRow[];
    /** Encoded cursor for the next page returned by the server's first
     *  `listNonPerformingControls` call. Null when the first page is
     *  also the last. */
    nextCursor?: string | null;
    /** Org slug used to build the API endpoint for client-side
     *  Load-more requests. Required when `nextCursor` is non-null. */
    orgSlug?: string;
}

const STATUS_VARIANTS: Record<NonPerformingControlRow['status'], 'warning' | 'info' | 'error'> = {
    NOT_STARTED: 'error',
    PLANNED: 'warning',
    IN_PROGRESS: 'info',
    IMPLEMENTING: 'info',
    NEEDS_REVIEW: 'warning',
};

function StatusBadgeForControl({ status }: { status: NonPerformingControlRow['status'] }) {
    const variant = STATUS_VARIANTS[status];
    return <StatusBadge variant={variant}>{status.replace(/_/g, ' ')}</StatusBadge>;
}

export function ControlsTable({ rows: initialRows, nextCursor: initialNextCursor, orgSlug }: Props) {
    const [sortBy, setSortBy] = useState<string>('tenantName');
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

    // Epic E — Load-more accumulator. Server-rendered initial page +
    // client-side fetched subsequent pages. Replaces the older
    // `<Link href="?cursor=...">` pattern that REPLACED rather than
    // accumulated, capping the dedicated drill-down at 50 rows.
    const pagination = useCursorPagination<NonPerformingControlRow>({
        initialRows,
        initialNextCursor: initialNextCursor ?? null,
        fetchUrl: (cursor) =>
            `/api/org/${orgSlug ?? ''}/portfolio?view=controls&cursor=${encodeURIComponent(cursor)}`,
    });

    // Sort by what each column DISPLAYS so same-displayed-value rows group
    // contiguously. The Status cell renders `status.replace(/_/g, ' ')`, so
    // its accessor mirrors that derivation (the raw underscored enum would
    // drift); the Code cell shows the `'—'` placeholder for a null code.
    const sortAccessors = useMemo<SortAccessors<NonPerformingControlRow>>(
        () => ({
            tenantName: (x) => x.tenantName || '',
            name: (x) => x.name || '',
            code: (x) => x.code ?? '—',
            status: (x) => x.status.replace(/_/g, ' '),
            updatedAt: (x) => x.updatedAt,
        }),
        [],
    );
    const sorted = useMemo(
        () => sortRowsByDisplay(pagination.rows, sortAccessors, sortBy, sortOrder),
        [pagination.rows, sortAccessors, sortBy, sortOrder],
    );

    const columns = useMemo(
        () =>
            createColumns<NonPerformingControlRow>([
                {
                    id: 'tenantName',
                    header: 'Tenant',
                    cell: ({ row }) => (
                        <span
                            className="text-xs font-medium text-content-muted"
                            data-testid={`org-control-tenant-${row.original.tenantSlug}`}
                        >
                            {row.original.tenantName}
                        </span>
                    ),
                },
                {
                    id: 'name',
                    header: 'Control',
                    cell: ({ row }) => (
                        <Link
                            href={row.original.drillDownUrl}
                            className="font-medium text-content-emphasis hover:text-content-info hover:underline"
                            data-testid={`org-control-link-${row.original.controlId}`}
                        >
                            {row.original.name}
                        </Link>
                    ),
                },
                {
                    id: 'code',
                    header: 'Code',
                    cell: ({ row }) => (
                        <span className="font-mono text-xs text-content-muted">
                            {row.original.code ?? '—'}
                        </span>
                    ),
                },
                {
                    id: 'status',
                    header: 'Status',
                    cell: ({ row }) => <StatusBadgeForControl status={row.original.status} />,
                },
                {
                    id: 'updatedAt',
                    header: 'Updated',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-subtle tabular-nums">
                            {formatDate(row.original.updatedAt)}
                        </span>
                    ),
                },
            ]),
        [],
    );

    return (
        <ListPageShell>
            <ListPageShell.Header>
                <div>
                    <Heading level={1}>
                        Non-Performing Controls
                    </Heading>
                    <p className="text-sm text-content-muted mt-1">
                        {pagination.rows.length} applicable control{pagination.rows.length === 1 ? '' : 's'} not yet implemented across the portfolio
                        {pagination.hasMore ? ' (more available)' : ''}
                    </p>
                </div>
            </ListPageShell.Header>
            <ListPageShell.Body>
                <DataTable<NonPerformingControlRow>
                    fillBody
                    // Epic 68 — Controls is the canonical opt-out site
                    // for auto-virtualization. The bespoke load-more
                    // pagination + per-row affordances rely on the
                    // standard non-virtualized DataTable layout. Per
                    // product directive, card scrolling on Controls
                    // stays as it is.
                    virtualize={false}
                    data={sorted}
                    columns={columns}
                    getRowId={(r) => r.controlId}
                    sortableColumns={['tenantName', 'name', 'code', 'status', 'updatedAt']}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={(p) => {
                        if (p.sortBy) setSortBy(p.sortBy);
                        if (p.sortOrder) setSortOrder(p.sortOrder);
                    }}
                    resourceName={(plural) => (plural ? 'controls' : 'control')}
                    emptyState={
                        <TableEmptyState
                            title="All controls performing"
                            description="No applicable controls are sitting in a non-implemented state across this organization's tenants."
                            icon={<ShieldCheck className="size-10" />}
                        />
                    }
                    data-testid="org-controls-table"
                />
                {pagination.hasMore && orgSlug && (
                    <div className="flex flex-col items-center gap-tight pt-3">
                        <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            data-testid="org-controls-load-more"
                            onClick={() => {
                                void pagination.loadMore();
                            }}
                            disabled={pagination.loading}
                        >
                            {pagination.loading ? 'Loading…' : 'Load more controls'}
                        </Button>
                        {pagination.error && (
                            <span
                                className="text-content-error text-sm"
                                role="alert"
                                data-testid="org-controls-load-error"
                            >
                                Failed to load more — please retry.
                            </span>
                        )}
                    </div>
                )}
            </ListPageShell.Body>
        </ListPageShell>
    );
}
