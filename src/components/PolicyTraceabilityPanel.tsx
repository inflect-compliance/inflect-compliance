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
import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
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
    const t = useTranslations('panels');
    const tr = useTranslations();

    const CONTROL_STATUS_LABELS = useMemo<Record<string, string>>(() => ({
        NOT_STARTED: tr('controls.statusLabels.NOT_STARTED'), IN_PROGRESS: tr('controls.statusLabels.IN_PROGRESS'),
        IMPLEMENTED: tr('controls.statusLabels.IMPLEMENTED'), NEEDS_REVIEW: tr('controls.statusLabels.NEEDS_REVIEW'),
        IMPLEMENTING: tr('controls.implementing'), PLANNED: tr('controls.planned'),
        NOT_APPLICABLE: tr('controls.notApplicable'),
    }), [tr]);
    const RISK_STATUS_LABELS = useMemo<Record<string, string>>(() => ({
        OPEN: tr('risks.bulkStatus.open'), MITIGATING: tr('risks.bulkStatus.mitigating'),
        MITIGATED: tr('risks.bulkStatus.mitigated'), ACCEPTED: tr('risks.bulkStatus.accepted'),
        CLOSED: tr('risks.bulkStatus.closed'),
    }), [tr]);
    const ASSET_TYPE_LABELS = useMemo<Record<string, string>>(() => ({
        INFORMATION: tr('assets.filterEnums.type.INFORMATION'), SYSTEM: tr('assets.filterEnums.type.SYSTEM'),
        SERVICE: tr('assets.filterEnums.type.SERVICE'), DATA_STORE: tr('assets.filterEnums.type.DATA_STORE'),
        VENDOR: tr('assets.filterEnums.type.VENDOR'), PEOPLE_PROCESS: tr('assets.filterEnums.type.PEOPLE_PROCESS'),
        APPLICATION: tr('assets.filterEnums.type.APPLICATION'), INFRASTRUCTURE: tr('assets.filterEnums.type.INFRASTRUCTURE'),
        PROCESS: tr('assets.filterEnums.type.PROCESS'), OTHER: tr('assets.filterEnums.type.OTHER'),
    }), [tr]);
    const CRIT_LABELS = useMemo<Record<string, string>>(() => ({
        LOW: t('criticalityLabels.LOW'), MEDIUM: t('criticalityLabels.MEDIUM'),
        HIGH: t('criticalityLabels.HIGH'), CRITICAL: t('criticalityLabels.CRITICAL'),
    }), [t]);

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

    const viaLabelT = (n: number) => n === 1 ? t('policyTrace.viaOne', { count: n }) : t('policyTrace.viaMany', { count: n });

    const controlColumns = createColumns<ControlEntry>([
        {
            id: 'control',
            header: t('col.control'),
            cell: ({ row }) => (
                <TableTitleCell href={tenantHref(`/controls/${row.original.control.id}`)}>
                    {row.original.control.code || row.original.control.name}
                </TableTitleCell>
            ),
        },
        {
            id: 'name',
            header: t('col.name'),
            cell: ({ row }) => (
                <span className="text-sm text-content-default">{row.original.control.name}</span>
            ),
        },
        {
            id: 'category',
            header: t('col.category'),
            cell: ({ row }) =>
                row.original.control.category ? (
                    <span className="text-sm text-content-muted">{row.original.control.category}</span>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                ),
        },
        {
            id: 'status',
            header: t('col.status'),
            cell: ({ row }) => {
                const s = row.original.control.status;
                return s ? (
                    <StatusBadge variant={CONTROL_STATUS_BADGE[s] ?? 'neutral'} size="sm">
                        {CONTROL_STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}
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
            header: t('col.risk'),
            cell: ({ row }) => (
                <TableTitleCell href={tenantHref(`/risks/${row.original.risk.id}`)}>
                    {row.original.risk.title}
                </TableTitleCell>
            ),
        },
        {
            id: 'category',
            header: t('col.category'),
            cell: ({ row }) =>
                row.original.risk.category ? (
                    <span className="text-sm text-content-muted">{row.original.risk.category}</span>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                ),
        },
        {
            id: 'score',
            header: t('col.score'),
            cell: ({ row }) => (
                <span className="text-sm tabular-nums text-content-default">
                    {row.original.risk.score ?? '—'}
                </span>
            ),
        },
        {
            id: 'status',
            header: t('col.status'),
            cell: ({ row }) => {
                const s = row.original.risk.status;
                return s ? (
                    <StatusBadge variant={RISK_STATUS_BADGE[s] ?? 'neutral'} size="sm">
                        {RISK_STATUS_LABELS[s] ?? s}
                    </StatusBadge>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                );
            },
        },
        {
            id: 'via',
            header: t('col.coverage'),
            cell: ({ row }) => (
                <span className="text-xs text-content-subtle">{viaLabelT(row.original.viaControls)}</span>
            ),
        },
    ]);

    const assetColumns = createColumns<AssetEntry>([
        {
            id: 'asset',
            header: t('col.asset'),
            cell: ({ row }) => (
                <TableTitleCell href={tenantHref(`/assets/${row.original.asset.id}`)}>
                    {row.original.asset.name}
                </TableTitleCell>
            ),
        },
        {
            id: 'type',
            header: t('col.type'),
            cell: ({ row }) =>
                row.original.asset.type ? (
                    <span className="text-sm text-content-muted">
                        {ASSET_TYPE_LABELS[row.original.asset.type] ?? row.original.asset.type.replace(/_/g, ' ')}
                    </span>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                ),
        },
        {
            id: 'criticality',
            header: t('col.criticality'),
            cell: ({ row }) => {
                const c = row.original.asset.criticality;
                return c ? (
                    <StatusBadge variant={CRITICALITY_BADGE[c] ?? 'neutral'} size="sm">
                        {CRIT_LABELS[c] ?? c}
                    </StatusBadge>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                );
            },
        },
        {
            id: 'via',
            header: t('col.coverage'),
            cell: ({ row }) => (
                <span className="text-xs text-content-subtle">{viaLabelT(row.original.viaControls)}</span>
            ),
        },
    ]);

    return (
        <div className="space-y-section">
            <InlineNotice variant="info">
                {t('policyTrace.notice')}
            </InlineNotice>

            <div className="space-y-default">
                <Heading level={3}>{tr('common.sections.controls')}</Heading>
                <DataTable<ControlEntry>
                    data={data?.controls ?? []}
                    columns={controlColumns}
                    loading={loading}
                    getRowId={(r) => r.id}
                    emptyState={
                        <EmptyState
                            size="sm"
                            variant="no-records"
                            title={t('policyTrace.emptyLinkedControls')}
                            description={t('policyTrace.emptyLinkedControlsDesc')}
                        />
                    }
                />
            </div>

            <div className="space-y-default">
                <Heading level={3}>{tr('common.sections.risks')}</Heading>
                <DataTable<RiskEntry>
                    data={data?.risks ?? []}
                    columns={riskColumns}
                    loading={loading}
                    getRowId={(r) => r.id}
                    emptyState={
                        <EmptyState
                            size="sm"
                            variant="no-records"
                            title={t('policyTrace.emptyRelatedRisks')}
                            description={t('policyTrace.emptyRelatedRisksDesc')}
                        />
                    }
                />
            </div>

            <div className="space-y-default">
                <Heading level={3}>{tr('common.sections.assets')}</Heading>
                <DataTable<AssetEntry>
                    data={data?.assets ?? []}
                    columns={assetColumns}
                    loading={loading}
                    getRowId={(r) => r.id}
                    emptyState={
                        <EmptyState
                            size="sm"
                            variant="no-records"
                            title={t('policyTrace.emptyRelatedAssets')}
                            description={t('policyTrace.emptyRelatedAssetsDesc')}
                        />
                    }
                />
            </div>
        </div>
    );
}
