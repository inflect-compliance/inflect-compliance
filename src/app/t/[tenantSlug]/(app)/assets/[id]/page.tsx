'use client';

import { formatDate, formatDateTime } from '@/lib/format-date';
import { SkeletonCard } from '@/components/ui/skeleton';
import { useState, useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { useParams } from 'next/navigation';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantMembers } from '@/components/ui/user-combobox';
import { ownerDisplayName } from '@/lib/owner-display';
import dynamic from 'next/dynamic';
import LinkedTasksPanel from '@/components/LinkedTasksPanel';
import { LinkedVendorsPanel } from '@/components/LinkedVendorsPanel';
import { EmptyState } from '@/components/ui/empty-state';
import { CopyText } from '@/components/ui/copy-text';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Pen2 } from '@/components/ui/icons/nucleo';
import { Tooltip, InfoTooltip } from '@/components/ui/tooltip';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { DataTable, type ColumnDef } from '@/components/ui/table';
import { Eyebrow } from '@/components/ui/typography';
import { KPIStat } from '@/components/ui/metric';
import type { AuditLogEntry } from '@/lib/dto';
import { AssetCriticalityBadge } from '../_form/AssetCriticalityFields';
import { MetaStrip } from '@/components/ui/meta-strip';
import { EntityDetailLayout } from '@/components/layout/EntityDetailLayout';
import { ProcessNodeReverseLookupModal } from '@/components/processes/ProcessNodeReverseLookupModal';
import { EntityPrevNextNav } from '@/components/ui/entity-prev-next-nav';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';
import { EditAssetModal } from '../EditAssetModal';
import { InheritedEvidencePanel } from '@/components/InheritedEvidencePanel';
import { AttachedEvidencePanel } from '@/components/AttachedEvidencePanel';
import { Heading } from '@/components/ui/typography';
import { InheritedTestPlansPanel } from '@/components/InheritedTestPlansPanel';
import { InheritedMappingsPanel } from '@/components/InheritedMappingsPanel';

const TraceabilityPanel = dynamic(() => import('@/components/TraceabilityPanel'), {
    loading: () => <SkeletonCard lines={3} />,
    ssr: false,
});

// getAsset → AssetRepository.getById (the Asset model; controls relation
// fetched but unread here).
export interface AssetDetail {
    id: string;
    name: string;
    type: 'INFORMATION' | 'SYSTEM' | 'SERVICE' | 'DATA_STORE' | 'VENDOR' | 'PEOPLE_PROCESS' | 'APPLICATION' | 'INFRASTRUCTURE' | 'PROCESS' | 'OTHER';
    classification: string | null;
    /** Legacy free-text owner — import-only fallback, distinct from the assignee. */
    owner: string | null;
    ownerUserId: string | null;
    /** Resolved assignee (the one Owner concept). */
    ownerUser: { id: string; name: string | null; email: string | null } | null;
    location: string | null;
    criticality: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
    status: 'ACTIVE' | 'RETIRED';
    dataResidency: string | null;
    externalRef: string | null;
    dependencies: string | null;
    businessProcesses: string | null;
    retention: string | null;
    confidentiality: number | null;
    integrity: number | null;
    availability: number | null;
    // Product-identity fields — power CVE→asset matching.
    cpe: string | null;
    vendor: string | null;
    product: string | null;
    version: string | null;
    createdAt: string;
    updatedAt: string;
    rollups?: AssetRollups;
}

/** 360° relationship roll-ups computed server-side by the `getAsset` usecase. */
interface AssetRollups {
    risks: { count: number };
    controls: { count: number };
    vulnerabilities: { openCount: number; maxSeverity: string | null; maxScore: number | null };
    tasks: { openCount: number; total: number };
}

/** One matched vulnerability row (GET /vulnerabilities?assetId=…). */
interface AssetVulnRow {
    id: string;
    status: string;
    matchedVia: string;
    remediationDueAt: string | null;
    cve: { id: string; cvssScore: number | null; cvssSeverity: string | null; summary: string } | null;
    ownerUser: { id: string; name: string | null; email: string | null } | null;
}

/** CVSS severity → StatusBadge variant. CRITICAL/HIGH → red, MEDIUM → amber, LOW → green. */
function severityVariant(sev: string | null | undefined): StatusBadgeVariant {
    const s = (sev ?? '').toUpperCase();
    if (s === 'CRITICAL' || s === 'HIGH') return 'error';
    if (s === 'MEDIUM') return 'warning';
    if (s === 'LOW') return 'success';
    return 'neutral';
}

/** Vuln remediation status → StatusBadge variant. */
function vulnStatusVariant(status: string): StatusBadgeVariant {
    switch (status) {
        case 'OPEN': return 'error';
        case 'MITIGATING': return 'warning';
        case 'MITIGATED': return 'success';
        case 'ACCEPTED': return 'info';
        default: return 'neutral';
    }
}

export default function AssetDetailPage() {
    const params = useParams();
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions, tenantSlug } = useTenantContext();
    const t = useTranslations('assets');
    const assetId = params.id as string;

    const assetQuery = useTenantSWR<AssetDetail>(`/assets/${assetId}`);
    const asset = assetQuery.data ?? null;
    const loading = assetQuery.isLoading;
    const loadError = assetQuery.error
        ? (assetQuery.error instanceof Error ? assetQuery.error.message : String(assetQuery.error))
        : '';
    // Mutation-error channel (status change etc.); load errors come from SWR above.
    const [error, setError] = useState('');
    // PR-D — "Where used" (process maps) reverse-lookup modal.
    const tWhereUsed = useTranslations('panels.processWhereUsed');
    const [processWhereUsedOpen, setProcessWhereUsedOpen] = useState(false);

    // One owner concept: the resolved assignee (ownerUserId → member). The
    // server includes `ownerUser`; the tenant roster is a fallback. The legacy
    // free-text `owner` is import-only and shown separately (labeled) ONLY when
    // there is no assignee — never a competing second "Owner".
    const { data: members } = useTenantMembers(tenantSlug);
    const ownerName = asset
        ? (asset.ownerUser
              ? ownerDisplayName(asset.ownerUser.name, asset.ownerUser.email)
              : asset.ownerUserId
                ? ownerDisplayName(
                      members?.find((m) => m.id === asset.ownerUserId)?.name,
                      members?.find((m) => m.id === asset.ownerUserId)?.email,
                  )
                : null)
        : null;
    const importedOwner = asset && !ownerName && asset.owner ? asset.owner : null;

    // B6 +1 — canonical 7-tab strip on every detail page. Same shape
    // as Controls / Risks: Overview holds the existing asset body;
    // Tasks + Traceability are inline-routed to the already-mounted
    // panels; the other four explain where the related-entity surface
    // lives.
    type Tab =
        | 'overview'
        | 'vulnerabilities'
        | 'tasks'
        | 'evidence'
        | 'mappings'
        | 'traceability'
        | 'activity'
        | 'tests';
    const [activeTab, setActiveTab] = useState<Tab>('overview');
    const tabs: ReadonlyArray<{ key: Tab; label: string }> = [
        { key: 'overview', label: t('detail.tabs.overview') },
        { key: 'vulnerabilities', label: t('detail.tabs.vulnerabilities') },
        { key: 'tasks', label: t('detail.tabs.tasks') },
        { key: 'evidence', label: t('detail.tabs.evidence') },
        { key: 'mappings', label: t('detail.tabs.mappings') },
        { key: 'traceability', label: t('detail.tabs.traceability') },
        { key: 'activity', label: t('detail.tabs.activity') },
        { key: 'tests', label: t('detail.tabs.tests') },
    ];

    // ─── Activity feed (lazy, only while the Activity tab is open) ───
    // Asset mutations log with entity='Asset'; these are the action
    // types surfaced with a friendly label (unknown falls back to raw).
    const ASSET_EVENT_KEYS = ['CREATE', 'UPDATE', 'SOFT_DELETE', 'ASSET_EVIDENCE_LINKED', 'ASSET_EVIDENCE_UNLINKED'] as const;
    const EVENT_LABELS: Record<string, string> = Object.fromEntries(
        ASSET_EVENT_KEYS.map((k) => [k, t(`detail.eventLabels.${k}`)]),
    );
    const activityQuery = useTenantSWR<AuditLogEntry[]>(
        activeTab === 'activity' ? `/assets/${assetId}/activity` : null,
    );
    const activity = activityQuery.data ?? [];
    const activityLoading = activityQuery.isLoading;

    // ─── Vulnerabilities feed (lazy, only while that tab is open) ───
    const vulnQuery = useTenantSWR<{ rows: AssetVulnRow[] }>(
        activeTab === 'vulnerabilities' ? `/vulnerabilities?assetId=${assetId}` : null,
    );
    const vulnRows = vulnQuery.data?.rows ?? [];
    const vulnLoading = vulnQuery.isLoading;
    // Per-row conversion state (id → 'risk' | 'finding' pending marker).
    const [convertingId, setConvertingId] = useState<string | null>(null);
    const convertVuln = async (id: string, kind: 'risk' | 'finding') => {
        setConvertingId(id);
        setError('');
        try {
            const endpoint = kind === 'risk' ? 'convert-to-risk' : 'convert-to-finding';
            const res = await fetch(apiUrl(`/vulnerabilities/${id}/${endpoint}`), { method: 'POST' });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || t('detail.vuln.convertFailed'));
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : t('detail.vuln.convertFailed'));
        } finally {
            setConvertingId(null);
        }
    };
    // Modal-form P2 — the inline-edit panel is replaced by an
    // EditAssetModal launched from the detail header. The page URL
    // stays canonical; modal state is purely overlay. Seeding values
    // are computed from the currently-loaded `asset` row at modal
    // open time.
    const [editing, setEditing] = useState(false);
    // Bumped on every open so <EditAssetModal> remounts and RE-SEEDS from the
    // current asset row — a reopened form never shows stale values (abandoned
    // edits from a prior cancel, or another asset's values). Bumped only on
    // open, so the close animation is preserved (no remount on close).
    const [editSeed, setEditSeed] = useState(0);
    const openEdit = () => {
        setEditSeed((n) => n + 1);
        setEditing(true);
    };
    const editInitial = asset
        ? {
              name: asset.name || '',
              type: asset.type || 'SYSTEM',
              classification: asset.classification || '',
              ownerUserId: asset.ownerUserId || '',
              location: asset.location || '',
              status: asset.status || 'ACTIVE',
              dataResidency: asset.dataResidency || '',
              externalRef: asset.externalRef || '',
              dependencies: asset.dependencies || '',
              businessProcesses: asset.businessProcesses || '',
              retention: asset.retention || '',
              confidentiality: asset.confidentiality ?? 3,
              integrity: asset.integrity ?? 3,
              availability: asset.availability ?? 3,
              cpe: asset.cpe || '',
              vendor: asset.vendor || '',
              product: asset.product || '',
              version: asset.version || '',
          }
        : {};

    // Item — surface a "add product identity" hint when the asset lacks
    // ALL machine-readable identity fields (no cpe AND no vendor AND no
    // product). Without any of these the CVE feed can never match the
    // asset, so nudge the user to add them.
    const missingIdentity =
        !!asset && !asset.cpe && !asset.vendor && !asset.product;

    // B5 — ordered asset-id list for the prev/next nav beside the name.
    // The default list order so the up/down buttons walk the same sequence
    // the list page shows. Best-effort: failures just hide the affordance.
    const assetListQuery = useTenantSWR<Array<{ id?: string }>>('/assets');
    const assetIds = useMemo(
        () =>
            Array.isArray(assetListQuery.data)
                ? assetListQuery.data
                      .map((r) => r?.id)
                      .filter((id): id is string => Boolean(id))
                : [],
        [assetListQuery.data],
    );

    // Item 29 — brand-color status action on the asset detail header.
    // AssetStatus is a two-state lifecycle (ACTIVE / RETIRED).
    const ASSET_STATUS_OPTIONS: ComboboxOption[] = [
        { value: 'ACTIVE', label: t('detail.statusActive') },
        { value: 'RETIRED', label: t('detail.statusRetired') },
    ];
    const [changingStatus, setChangingStatus] = useState(false);
    const changeStatus = async (status: string) => {
        setChangingStatus(true);
        setError('');
        try {
            const res = await fetch(apiUrl(`/assets/${assetId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || t('detail.changeStatusFailed', { status: res.status }));
            }
            await assetQuery.mutate();
        } catch (err) {
            setError(err instanceof Error ? err.message : t('detail.changeStatusFailedGeneric'));
        } finally {
            setChangingStatus(false);
        }
    };

    // CRITICAL + HIGH both render as the error (red) badge — the StatusBadge
    // palette has no distinct orange between amber (warning) and red (error);
    // MEDIUM stays amber, LOW green.
    const critColor = (c: string): StatusBadgeVariant => c === 'CRITICAL' || c === 'HIGH' ? 'error' : c === 'MEDIUM' ? 'warning' : 'success';

    const breadcrumbs = [
        { label: t('detail.crumbDashboard'), href: tenantHref('/dashboard') },
        { label: t('detail.crumbAssets'), href: tenantHref('/assets') },
        { label: asset?.name ?? t('detail.crumbFallback') },
    ];
    if (loading) {
        return (
            <EntityDetailLayout loading title="" breadcrumbs={breadcrumbs}>
                <></>
            </EntityDetailLayout>
        );
    }
    if (loadError && !asset) {
        return (
            <EntityDetailLayout error={loadError} title="" breadcrumbs={breadcrumbs}>
                <></>
            </EntityDetailLayout>
        );
    }
    if (!asset) {
        return (
            <EntityDetailLayout empty={{ message: t('detail.notFound') }} title="" breadcrumbs={breadcrumbs}>
                <></>
            </EntityDetailLayout>
        );
    }

    return (
        <EntityDetailLayout
            id="asset-detail-page"
            back={{ smart: true }}
            breadcrumbs={breadcrumbs}
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(k) => setActiveTab(k)}
            actions={
                <>
                    {/* PR-D — Where used in process maps. Visible to all
                        viewers (readers + auditors need it most). */}
                    <Button
                        variant="secondary"
                        onClick={() => setProcessWhereUsedOpen(true)}
                        id="asset-where-used-btn"
                        data-testid="asset-where-used-btn"
                    >
                        {tWhereUsed('button')}
                    </Button>
                    {permissions.canWrite && (
                        <Combobox
                            hideSearch
                            id="asset-status-select"
                            selected={ASSET_STATUS_OPTIONS.find(o => o.value === (asset.status || 'ACTIVE')) ?? null}
                            setSelected={(opt) => { if (opt) changeStatus(opt.value); }}
                            options={ASSET_STATUS_OPTIONS}
                            disabled={changingStatus}
                            placeholder={t('detail.statusPlaceholder')}
                            // Item 29 — brand-color the status action (matches the
                            // primary "+ …" create buttons), consistent with risk /
                            // task / control detail headers.
                            buttonProps={{ variant: 'primary', className: 'text-sm' }}
                        />
                    )}
                </>
            }

            title={
                <span className="inline-flex items-center gap-2.5">
                    <span id="asset-title-heading">{asset.name}</span>
                    {/* B5 — step to the prev/next asset in list order. */}
                    <EntityPrevNextNav
                        ids={assetIds}
                        currentId={assetId}
                        hrefFor={(id) => tenantHref(`/assets/${id}`)}
                        labelSingular="asset"
                    />
                </span>
            }
            meta={
                <MetaStrip
                    items={[
                        {
                            label: t('detail.type'),
                            value: asset.type?.replace(/_/g, ' '),
                        },
                        ...(asset.criticality
                            ? [
                                  {
                                      kind: 'status' as const,
                                      label: t('colHeaders.criticality'),
                                      value: asset.criticality,
                                      variant: critColor(asset.criticality),
                                  },
                              ]
                            : []),
                        {
                            kind: 'status' as const,
                            label: t('detail.status'),
                            value: asset.status || 'ACTIVE',
                            variant:
                                asset.status === 'RETIRED'
                                    ? 'neutral'
                                    : 'success',
                        },
                    ]}
                />
            }
        >
            {error && <div className={cn(cardVariants({ density: 'compact' }), 'border-border-error text-content-error text-sm')}>{error}</div>}

            {/* Edit modal — modal-form P2. Always mounted so the
                modal's own open/close state survives tab switches. */}
            {permissions.canWrite && (
                <EditAssetModal
                    key={`edit-${assetId}-${editSeed}`}
                    open={editing}
                    setOpen={setEditing}
                    assetId={assetId}
                    initial={editInitial}
                    onSaved={(updated) => assetQuery.mutate(updated, { revalidate: false })}
                />
            )}

            {activeTab === 'tasks' && (
                <div className={cardVariants()} id="asset-tasks-tab">
                    <LinkedTasksPanel
                        apiBase={apiUrl('')}
                        entityType="ASSET"
                        entityId={assetId}
                        tenantHref={tenantHref}
                        canWrite={permissions.canWrite}
                    />
                </div>
            )}
            {activeTab === 'vulnerabilities' && (
                <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')} id="asset-vulnerabilities-tab">
                    <DataTable<AssetVulnRow>
                        data={vulnRows}
                        loading={vulnLoading}
                        getRowId={(v) => v.id}
                        resourceName={(plural) => (plural ? t('detail.tabs.vulnerabilities') : t('detail.tabs.vulnerabilities'))}
                        emptyState={
                            <EmptyState
                                size="sm"
                                variant="no-records"
                                title={t('detail.vuln.emptyTitle')}
                                description={t('detail.vuln.emptyDesc')}
                            />
                        }
                        columns={[
                            {
                                id: 'cve',
                                header: 'CVE',
                                cell: ({ row }) => <span className="font-medium text-content-default">{row.original.cve?.id ?? '—'}</span>,
                            },
                            {
                                id: 'severity',
                                header: t('detail.vuln.severity'),
                                cell: ({ row }) => (
                                    <StatusBadge variant={severityVariant(row.original.cve?.cvssSeverity)} size="sm">
                                        {row.original.cve?.cvssSeverity ?? t('detail.vuln.none')}
                                    </StatusBadge>
                                ),
                            },
                            {
                                id: 'score',
                                header: t('detail.vuln.score'),
                                cell: ({ row }) => <span className="text-sm tabular-nums">{row.original.cve?.cvssScore ?? t('detail.vuln.none')}</span>,
                            },
                            {
                                id: 'status',
                                header: t('detail.vuln.status'),
                                cell: ({ row }) => (
                                    <StatusBadge variant={vulnStatusVariant(row.original.status)} size="sm">
                                        {row.original.status}
                                    </StatusBadge>
                                ),
                            },
                            {
                                id: 'matchedVia',
                                header: t('detail.vuln.matchedVia'),
                                cell: ({ row }) => <span className="text-sm text-content-muted">{row.original.matchedVia}</span>,
                            },
                            {
                                id: 'owner',
                                header: t('detail.vuln.owner'),
                                cell: ({ row }) => (
                                    <span className="text-sm text-content-muted">
                                        {row.original.ownerUser?.name || row.original.ownerUser?.email || t('detail.vuln.unassigned')}
                                    </span>
                                ),
                            },
                            {
                                id: 'due',
                                header: t('detail.vuln.due'),
                                cell: ({ row }) => (
                                    <span className="text-sm text-content-muted">
                                        {row.original.remediationDueAt ? formatDate(row.original.remediationDueAt) : t('detail.vuln.none')}
                                    </span>
                                ),
                            },
                            ...(permissions.canWrite
                                ? [{
                                      id: 'actions',
                                      header: t('detail.vuln.actions'),
                                      cell: ({ row }: { row: { original: AssetVulnRow } }) => (
                                          <div className="flex items-center gap-compact">
                                              <Button
                                                  variant="secondary"
                                                  size="sm"
                                                  disabled={convertingId === row.original.id}
                                                  onClick={() => convertVuln(row.original.id, 'risk')}
                                              >
                                                  {t('detail.vuln.convertToRisk')}
                                              </Button>
                                              <Button
                                                  variant="secondary"
                                                  size="sm"
                                                  disabled={convertingId === row.original.id}
                                                  onClick={() => convertVuln(row.original.id, 'finding')}
                                              >
                                                  {t('detail.vuln.convertToFinding')}
                                              </Button>
                                          </div>
                                      ),
                                  }]
                                : []),
                        ] as ColumnDef<AssetVulnRow, unknown>[]}
                    />
                </div>
            )}
            {activeTab === 'traceability' && (
                <div className="space-y-default">
                    <div className="space-y-tight">
                        <Heading level={3}>{t('detail.traceabilityHeading')}</Heading>
                        <p className="text-sm text-content-muted">{t('detail.traceabilitySubtitle')}</p>
                    </div>
                    <TraceabilityPanel
                        apiBase={apiUrl('')}
                        entityType="asset"
                        entityId={assetId}
                        canWrite={permissions.canWrite}
                        tenantHref={tenantHref}
                    />
                    <div className="border-t border-border-subtle pt-default">
                        <LinkedVendorsPanel entityType="ASSET" entityId={assetId} />
                    </div>
                </div>
            )}
            {activeTab === 'evidence' && (
                <div className="space-y-section">
                    <div className="space-y-default">
                        <Heading level={3}>{t('detail.attachedEvidence')}</Heading>
                        <AttachedEvidencePanel
                            tenantSlug={tenantSlug}
                            entityId={assetId}
                            entity="asset"
                            endpoint={`/assets/${assetId}/evidence/attached`}
                            apiUrl={apiUrl}
                            tenantHref={tenantHref}
                            canWrite={permissions.canWrite}
                        />
                    </div>
                    <div className="space-y-default">
                        <Heading level={3}>{t('detail.inheritedFromControls')}</Heading>
                        <InheritedEvidencePanel
                            endpoint={apiUrl(`/assets/${assetId}/evidence`)}
                            tenantHref={tenantHref}
                            entityLabel="asset"
                        />
                    </div>
                </div>
            )}
            {activeTab === 'mappings' && (
                <InheritedMappingsPanel
                    endpoint={apiUrl(`/assets/${assetId}/mappings`)}
                    tenantHref={tenantHref}
                    entityLabel="asset"
                />
            )}
            {activeTab === 'activity' && (
                <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                    {activityLoading ? (
                        <div className="p-8 text-center text-content-subtle animate-pulse">{t('detail.activityFeed.loading')}</div>
                    ) : activity.length === 0 ? (
                        <EmptyState
                            size="sm"
                            variant="no-records"
                            title={t('detail.activityFeed.emptyTitle')}
                            description={t('detail.activityFeed.emptyDesc')}
                        />
                    ) : (
                        <div className="divide-y divide-border-default/50" id="asset-activity-feed">
                            {activity.map((ev) => (
                                <div key={ev.id} className="px-5 py-3 flex items-start gap-compact">
                                    <div className="mt-0.5">
                                        <StatusBadge variant="info">{EVENT_LABELS[ev.action] || ev.action}</StatusBadge>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-content-default">{ev.details}</p>
                                        <p className="text-xs text-content-subtle mt-0.5">
                                            {ev.user?.name || t('detail.activityFeed.systemActor')} · {formatDateTime(ev.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {activeTab === 'tests' && (
                <InheritedTestPlansPanel
                    endpoint={apiUrl(`/assets/${assetId}/test-plans`)}
                    tenantHref={tenantHref}
                    entityLabel="asset"
                />
            )}

            {activeTab === 'overview' && (
                <>

            {/* 360° relationship roll-ups — four clickable stats that jump to
                the relevant tab. Counts come from the getAsset usecase. */}
            {asset.rollups && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-default" id="asset-rollups">
                    <button
                        type="button"
                        onClick={() => setActiveTab('traceability')}
                        className={cn(cardVariants({ density: 'compact' }), 'text-left hover:border-border-emphasis transition-colors')}
                    >
                        <KPIStat label={t('detail.rollups.risks')} value={asset.rollups.risks.count} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('traceability')}
                        className={cn(cardVariants({ density: 'compact' }), 'text-left hover:border-border-emphasis transition-colors')}
                    >
                        <KPIStat label={t('detail.rollups.controls')} value={asset.rollups.controls.count} />
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('vulnerabilities')}
                        className={cn(cardVariants({ density: 'compact' }), 'text-left hover:border-border-emphasis transition-colors')}
                    >
                        <KPIStat
                            label={t('detail.rollups.vulnerabilities')}
                            value={asset.rollups.vulnerabilities.openCount}
                            tone={asset.rollups.vulnerabilities.openCount > 0 ? 'attention' : 'default'}
                            description={asset.rollups.vulnerabilities.maxSeverity ? (
                                <StatusBadge variant={severityVariant(asset.rollups.vulnerabilities.maxSeverity)} size="sm">
                                    {asset.rollups.vulnerabilities.maxSeverity}
                                </StatusBadge>
                            ) : undefined}
                        />
                    </button>
                    <button
                        type="button"
                        onClick={() => setActiveTab('tasks')}
                        className={cn(cardVariants({ density: 'compact' }), 'text-left hover:border-border-emphasis transition-colors')}
                    >
                        <KPIStat label={t('detail.rollups.tasks')} value={asset.rollups.tasks.openCount} />
                    </button>
                </div>
            )}

            {/* "Add product identity" hint — CVE→asset matching needs at
                least one of cpe / vendor / product. Lightweight inline
                callout; opens the edit modal so the user can add them. */}
            {missingIdentity && (
                <div
                    className={cn(
                        cardVariants({ density: 'compact' }),
                        'flex flex-col gap-compact border-border-emphasis/50 sm:flex-row sm:items-center sm:justify-between',
                    )}
                    id="asset-identity-hint"
                >
                    <div className="space-y-tight">
                        <p className="text-sm font-medium text-content-default">{t('detail.identityHintTitle')}</p>
                        <p className="text-xs text-content-muted">{t('detail.identityHintBody')}</p>
                    </div>
                    {permissions.canWrite && (
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={openEdit}
                            id="asset-identity-hint-btn"
                        >
                            {t('detail.identityHintAction')}
                        </Button>
                    )}
                </div>
            )}

            {/* Detail card — read-only view; edits flow through EditAssetModal. */}
            <div className={cn(cardVariants(), 'space-y-default')} id="asset-detail">
                {permissions.canWrite && (
                    <div className="flex justify-end -mt-1 -mb-2">
                        {/* B2 — icon-only edit affordance; opens the Edit
                            Asset modal, mirroring the control overview. */}
                        <Tooltip content={t('detail.editAsset')}>
                            <Button
                                variant="secondary"
                                size="icon"
                                onClick={openEdit}
                                id="edit-asset-btn"
                                aria-label={t('detail.editAsset')}
                            >
                                <Pen2 className="size-4" />
                            </Button>
                        </Tooltip>
                    </div>
                )}
                <>
                        {asset.classification && <div><Eyebrow>{t('detail.classification')}</Eyebrow><p className="text-sm">{asset.classification}</p></div>}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                            <div>
                                <Eyebrow>{t('detail.owner')}</Eyebrow>
                                {ownerName ? (
                                    <p className="text-sm">{ownerName}</p>
                                ) : importedOwner ? (
                                    <p className="text-sm">
                                        {importedOwner}{' '}
                                        <span className="text-xs text-content-subtle">({t('list.ownerImported')})</span>
                                    </p>
                                ) : (
                                    <p className="text-sm">—</p>
                                )}
                            </div>
                            <div><Eyebrow>{t('detail.location')}</Eyebrow><p className="text-sm">{asset.location || '—'}</p></div>
                            <div>
                                <Eyebrow>{t('detail.externalRef')}</Eyebrow>
                                {asset.externalRef ? (
                                    <CopyText
                                        value={asset.externalRef}
                                        label={t('detail.copyExternalRef', { ref: asset.externalRef })}
                                        successMessage={t('detail.externalRefCopied')}
                                        className="text-sm text-content-default"
                                    >
                                        {asset.externalRef}
                                    </CopyText>
                                ) : (
                                    <p className="text-sm">—</p>
                                )}
                            </div>
                            <div><Eyebrow>{t('detail.dataResidency')}</Eyebrow><p className="text-sm">{asset.dataResidency || '—'}</p></div>
                        </div>
                        {/* Context — dependencies / business processes / retention.
                            Persisted by the API; previously surfaced nowhere. */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-default">
                            <div><Eyebrow>{t('detail.dependencies')}</Eyebrow><p className="text-sm whitespace-pre-wrap">{asset.dependencies || '—'}</p></div>
                            <div><Eyebrow>{t('detail.businessProcesses')}</Eyebrow><p className="text-sm whitespace-pre-wrap">{asset.businessProcesses || '—'}</p></div>
                            <div><Eyebrow>{t('detail.retention')}</Eyebrow><p className="text-sm whitespace-pre-wrap">{asset.retention || '—'}</p></div>
                        </div>
                        {/* Product identity — the CVE→asset matching keys. */}
                        <div className="flex items-center gap-1.5 border-t border-border-default/50 pt-4">
                            <Heading level={3}>{t('detail.identityHeading')}</Heading>
                            <InfoTooltip content={t('form.identityTooltip')} aria-label={t('detail.identityHeading')} />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                            <div className="col-span-2 md:col-span-4"><Eyebrow>{t('detail.cpe')}</Eyebrow><p className="text-sm break-all">{asset.cpe || '—'}</p></div>
                            <div><Eyebrow>{t('detail.vendor')}</Eyebrow><p className="text-sm">{asset.vendor || '—'}</p></div>
                            <div><Eyebrow>{t('detail.product')}</Eyebrow><p className="text-sm">{asset.product || '—'}</p></div>
                            <div><Eyebrow>{t('detail.version')}</Eyebrow><p className="text-sm">{asset.version || '—'}</p></div>
                        </div>
                        <div className="flex items-center gap-1.5">
                            <Heading level={3}>{t('detail.criticalityHeading')}</Heading>
                            <InfoTooltip content={t('detail.ciaLegendBody')} aria-label={t('detail.criticalityHeading')} />
                        </div>
                        <AssetCriticalityBadge
                            confidentiality={asset.confidentiality ?? 3}
                            integrity={asset.integrity ?? 3}
                            availability={asset.availability ?? 3}
                        />
                        <div className="grid grid-cols-2 gap-default border-t border-border-default/50 pt-4">
                            <div><Eyebrow>{t('detail.created')}</Eyebrow><p className="text-sm text-content-muted">{formatDate(asset.createdAt)}</p></div>
                            <div><Eyebrow>{t('detail.updated')}</Eyebrow><p className="text-sm text-content-muted">{formatDate(asset.updatedAt)}</p></div>
                        </div>
                    </>
            </div>

                </>
            )}

            {/* PR-D — Where used (process maps) reverse-lookup modal */}
            <ProcessNodeReverseLookupModal
                entityType="asset"
                entityId={assetId}
                tenantSlug={tenantSlug}
                open={processWhereUsedOpen}
                onOpenChange={setProcessWhereUsedOpen}
            />
        </EntityDetailLayout>
    );
}
