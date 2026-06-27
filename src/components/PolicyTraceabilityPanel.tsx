'use client';

/**
 * Read-only traceability for the Policy detail page.
 *
 * A policy links DIRECTLY to controls (`PolicyControlLink`); the risks
 * those controls mitigate and the assets they protect are INHERITED
 * through the controls. So this panel surfaces three sections —
 * linked Controls, then the Risks and Assets reachable via them (each
 * tagged "via N controls"). There is no add/unlink affordance: controls
 * are managed through the policy↔control link flow, and risk/asset
 * coverage is purely derived. The shape mirrors the Asset/Risk inherited
 * data panels for visual consistency.
 */
import { useEffect, useState } from 'react';
import { DataTable, createColumns } from '@/components/ui/table';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { EmptyState } from '@/components/ui/empty-state';
import { InlineNotice } from '@/components/ui/inline-notice';
import { Heading } from '@/components/ui/typography';

interface ControlRef {
    id: string;
    code: string | null;
    name: string;
    status: string | null;
    category: string | null;
}
interface RiskRef {
    id: string;
    title: string;
    status: string | null;
    score: number | null;
    category: string | null;
}
interface AssetRef {
    id: string;
    name: string;
    type: string | null;
    criticality: string | null;
    status: string | null;
}
interface ControlEntry {
    id: string;
    control: ControlRef;
}
interface RiskEntry {
    id: string;
    risk: RiskRef;
    viaControls: number;
}
interface AssetEntry {
    id: string;
    asset: AssetRef;
    viaControls: number;
}
interface PolicyTraceData {
    policyId: string;
    controls: ControlEntry[];
    risks: RiskEntry[];
    assets: AssetEntry[];
}

const CONTROL_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    IMPLEMENTED: 'success',
    IN_PROGRESS: 'info',
    IMPLEMENTING: 'info',
    PLANNED: 'info',
    NEEDS_REVIEW: 'warning',
    NOT_STARTED: 'neutral',
    NOT_APPLICABLE: 'neutral',
};
const RISK_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    OPEN: 'error',
    MITIGATING: 'warning',
    MITIGATED: 'success',
    ACCEPTED: 'info',
    CLOSED: 'success',
};
const CRITICALITY_BADGE: Record<string, StatusBadgeVariant> = {
    HIGH: 'error',
    MEDIUM: 'warning',
    LOW: 'neutral',
};

function viaLabel(n: number): string {
    return `via ${n} control${n === 1 ? '' : 's'}`;
}

export default function PolicyTraceabilityPanel({
    endpoint,
    tenantHref,
}: {
    /** Fully-qualified tenant API path, e.g. apiUrl('/policies/123/traceability'). */
    endpoint: string;
    tenantHref: (path: string) => string;
}) {
    const [data, setData] = useState<PolicyTraceData | null>(null);
    const [loading, setLoading] = useState(true);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => {
        let cancelled = false;
        setLoading(true);
        (async () => {
            try {
                const res = await fetch(endpoint);
                const json = res.ok ? await res.json() : null;
                if (!cancelled) setData(json);
            } catch {
                if (!cancelled) setData(null);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [endpoint]);

    const controlColumns = createColumns<ControlEntry>([
        {
            id: 'control',
            header: 'Control',
            cell: ({ row }) => (
                <TableTitleCell href={tenantHref(`/controls/${row.original.control.id}`)}>
                    {row.original.control.code || row.original.control.name}
                </TableTitleCell>
            ),
        },
        {
            id: 'name',
            header: 'Name',
            cell: ({ row }) => (
                <span className="text-sm text-content-default">{row.original.control.name}</span>
            ),
        },
        {
            id: 'category',
            header: 'Category',
            cell: ({ row }) =>
                row.original.control.category ? (
                    <span className="text-sm text-content-muted">{row.original.control.category}</span>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                ),
        },
        {
            id: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const s = row.original.control.status;
                return s ? (
                    <StatusBadge variant={CONTROL_STATUS_BADGE[s] ?? 'neutral'} size="sm">
                        {s.replace(/_/g, ' ')}
                    </StatusBadge>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                );
            },
        },
    ]);

    const riskColumns = createColumns<RiskEntry>([
        {
            id: 'risk',
            header: 'Risk',
            cell: ({ row }) => (
                <TableTitleCell href={tenantHref(`/risks/${row.original.risk.id}`)}>
                    {row.original.risk.title}
                </TableTitleCell>
            ),
        },
        {
            id: 'category',
            header: 'Category',
            cell: ({ row }) =>
                row.original.risk.category ? (
                    <span className="text-sm text-content-muted">{row.original.risk.category}</span>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                ),
        },
        {
            id: 'score',
            header: 'Score',
            cell: ({ row }) => (
                <span className="text-sm tabular-nums text-content-default">
                    {row.original.risk.score ?? '—'}
                </span>
            ),
        },
        {
            id: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const s = row.original.risk.status;
                return s ? (
                    <StatusBadge variant={RISK_STATUS_BADGE[s] ?? 'neutral'} size="sm">
                        {s}
                    </StatusBadge>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                );
            },
        },
        {
            id: 'via',
            header: 'Coverage',
            cell: ({ row }) => (
                <span className="text-xs text-content-subtle">{viaLabel(row.original.viaControls)}</span>
            ),
        },
    ]);

    const assetColumns = createColumns<AssetEntry>([
        {
            id: 'asset',
            header: 'Asset',
            cell: ({ row }) => (
                <TableTitleCell href={tenantHref(`/assets/${row.original.asset.id}`)}>
                    {row.original.asset.name}
                </TableTitleCell>
            ),
        },
        {
            id: 'type',
            header: 'Type',
            cell: ({ row }) =>
                row.original.asset.type ? (
                    <span className="text-sm text-content-muted">
                        {row.original.asset.type.replace(/_/g, ' ')}
                    </span>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                ),
        },
        {
            id: 'criticality',
            header: 'Criticality',
            cell: ({ row }) => {
                const c = row.original.asset.criticality;
                return c ? (
                    <StatusBadge variant={CRITICALITY_BADGE[c] ?? 'neutral'} size="sm">
                        {c}
                    </StatusBadge>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                );
            },
        },
        {
            id: 'via',
            header: 'Coverage',
            cell: ({ row }) => (
                <span className="text-xs text-content-subtle">{viaLabel(row.original.viaControls)}</span>
            ),
        },
    ]);

    return (
        <div className="space-y-section">
            <InlineNotice variant="info">
                A policy links directly to controls; the risks those controls mitigate and the
                assets they protect are inherited through them. Manage these links on each control.
            </InlineNotice>

            <div className="space-y-default">
                <Heading level={3}>Controls</Heading>
                <DataTable<ControlEntry>
                    data={data?.controls ?? []}
                    columns={controlColumns}
                    loading={loading}
                    getRowId={(r) => r.id}
                    emptyState={
                        <EmptyState
                            size="sm"
                            variant="no-records"
                            title="No linked controls"
                            description="This policy is not linked to any controls yet."
                        />
                    }
                />
            </div>

            <div className="space-y-default">
                <Heading level={3}>Risks</Heading>
                <DataTable<RiskEntry>
                    data={data?.risks ?? []}
                    columns={riskColumns}
                    loading={loading}
                    getRowId={(r) => r.id}
                    emptyState={
                        <EmptyState
                            size="sm"
                            variant="no-records"
                            title="No related risks"
                            description="None of this policy's controls mitigate a risk yet."
                        />
                    }
                />
            </div>

            <div className="space-y-default">
                <Heading level={3}>Assets</Heading>
                <DataTable<AssetEntry>
                    data={data?.assets ?? []}
                    columns={assetColumns}
                    loading={loading}
                    getRowId={(r) => r.id}
                    emptyState={
                        <EmptyState
                            size="sm"
                            variant="no-records"
                            title="No related assets"
                            description="None of this policy's controls protect an asset yet."
                        />
                    }
                />
            </div>
        </div>
    );
}
