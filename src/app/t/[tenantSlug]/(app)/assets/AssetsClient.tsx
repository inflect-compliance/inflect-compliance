'use client';
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { DataTable, createColumns, useColumnsDropdown } from '@/components/ui/table';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
    useFilterCardVisibility,
    type CardDefinition,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { Tooltip } from '@/components/ui/tooltip';
import { AppIcon } from '@/components/icons/AppIcon';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import { buildAssetFilters, ASSET_FILTER_KEYS } from './filter-defs';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import { buttonVariants } from '@/components/ui/button-variants';
import { StatusBadge } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { useKpiFilter, type KpiFilterDef } from '@/components/ui/kpi-filter';
import { Plus } from '@/components/ui/icons/nucleo';
import { buildCumulativeTrend } from './asset-kpi-trend';
import { NewAssetModal } from './NewAssetModal';

interface AssetsClientProps {
    initialAssets: any[];
    initialFilters: Record<string, string>;
    tenantSlug: string;
    permissions: { canWrite: boolean };
    translations: {
        title: string;
        listDescription: string;
        addAsset: string;
        createAsset: string;
        name: string;
        type: string;
        classification: string;
        classificationPlaceholder: string;
        owner: string;
        location: string;
        dataResidency: string;
        residencyPlaceholder: string;
        confidentiality: string;
        integrity: string;
        availability: string;
        cia: string;
        controlsCol: string;
        noAssets: string;
        cancel: string;
        assetsRegistered: string;
    };
}

/**
 * Client island for assets — handles create form, filter interactions, and table navigation.
 * Data is pre-fetched server-side and passed via props.
 */
export function AssetsClient(props: AssetsClientProps) {
    const filterCtx = useFilterContext([], ASSET_FILTER_KEYS, {
        serverFilters: props.initialFilters,
    });
    return (
        <FilterProvider value={filterCtx}>
            <AssetsPageInner {...props} />
        </FilterProvider>
    );
}

function AssetsPageInner({ initialAssets, initialFilters, tenantSlug, permissions, translations: t }: AssetsClientProps) {
    // Modal-form follow-up — create-asset modal mounted off the list,
    // auto-opening on `?create=1` (the redirect target from
    // `/assets/new`). Matches the canonical NewVendorModal wiring.
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const searchParams = useSearchParams();
    const router = useRouter();
    useEffect(() => {
        if (searchParams?.get('create') === '1') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsCreateOpen(true);
            const next = new URLSearchParams(searchParams.toString());
            next.delete('create');
            const qs = next.toString();
            router.replace(
                `/t/${tenantSlug}/assets${qs ? `?${qs}` : ''}`,
                { scroll: false },
            );
        }
        // First-mount only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;

    const filterCtx = useFilters();
    const { state, search, hasActive } = filterCtx;
    const fetchParams = useMemo(
        () => toApiSearchParams(state, { search }),
        [state, search],
    );
    const queryKeyFilters = useMemo(() => {
        const obj: Record<string, string> = {};
        for (const [k, v] of fetchParams) obj[k] = v;
        return obj;
    }, [fetchParams]);

    const serverHadFilters = initialFilters && Object.keys(initialFilters).length > 0;
    const filtersMatchInitial = useMemo(() => {
        if (!serverHadFilters) return !hasActive;
        const keys = new Set([...Object.keys(queryKeyFilters), ...Object.keys(initialFilters)]);
        for (const k of keys) {
            if ((queryKeyFilters[k] ?? '') !== (initialFilters[k] ?? '')) return false;
        }
        return true;
    }, [queryKeyFilters, initialFilters, serverHadFilters, hasActive]);

    const assetsQuery = useQuery({
        queryKey: queryKeys.assets.list(tenantSlug, queryKeyFilters),
        queryFn: async () => {
            const qs = fetchParams.toString();
            const res = await fetch(apiUrl(`/assets${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch assets');
            return res.json();
        },
        initialData: filtersMatchInitial ? initialAssets : undefined,
    });
    const assets = assetsQuery.data ?? [];
    const liveFilters = useMemo(() => buildAssetFilters(), []);
    // R-filter-gear (#3, 2026-06-07) — the gear controls the quantifiable
    // KPI cards (Total / Active / High criticality / Retired), not the
    // filter categories (which stay in the Filter dropdown).
    const kpiCards: CardDefinition[] = useMemo(
        () => [
            { id: 'total', label: 'Total assets', kind: 'kpi' },
            { id: 'active', label: 'Active', kind: 'kpi' },
            { id: 'critical', label: 'High criticality', kind: 'kpi' },
            { id: 'retired', label: 'Retired', kind: 'kpi' },
        ],
        [],
    );
    const { visibleCards: visibleKpiCards, dropdown: filtersDropdown } =
        useFilterCardVisibility({
            storageKey: 'inflect:filter-vis:assets',
            cards: kpiCards,
        });

    // R23-PR-D — KPI definitions for the Assets page. Mirrors the
    // Risks-page reference shape: typed id union, predicate per KPI
    // derives `isActive` from current filter state (so a card lights
    // up whether the user clicked the KPI or set the filter via the
    // dropdown). Granular `clear` callbacks scope toggle-off to each
    // KPI's own key (status / criticality), so sibling filters
    // survive.
    type AssetKpiId = 'total' | 'active' | 'critical' | 'retired';
    // guardrail-ignore: KPI counts across the loaded page, not a refilter.
    const totalAssets = assets.length;
    // guardrail-ignore: KPI count, not a refilter.
    const activeAssets = assets.filter((a: any) => a.status === 'ACTIVE').length;
    // guardrail-ignore: KPI count, not a refilter.
    const criticalAssets = assets.filter((a: any) => a.criticality === 'HIGH').length;
    // guardrail-ignore: KPI count, not a refilter.
    const retiredAssets = assets.filter((a: any) => a.status === 'RETIRED').length;

    // Sparkline data per KPI — cumulative count by `createdAt`, so each
    // tile shows how its current number was built up over time. Derived
    // client-side from the loaded rows (no extra request).
    const assetTrends = useMemo(
        () => ({
            total: buildCumulativeTrend(assets, () => true),
            active: buildCumulativeTrend(assets, (a) => a.status === 'ACTIVE'),
            critical: buildCumulativeTrend(assets, (a) => a.criticality === 'HIGH'),
            retired: buildCumulativeTrend(assets, (a) => a.status === 'RETIRED'),
        }),
        [assets],
    );

    const assetKpiDefs: ReadonlyArray<KpiFilterDef<AssetKpiId>> = useMemo(
        () => [
            {
                id: 'total',
                apply: (ctx) => ctx.clearAll(),
                isActive: (s) => Object.keys(s).length === 0,
            },
            {
                id: 'active',
                apply: (ctx) => ctx.set('status', 'ACTIVE'),
                isActive: (s) => (s.status ?? []).includes('ACTIVE'),
                clear: (ctx) => ctx.removeAll('status'),
            },
            {
                id: 'critical',
                apply: (ctx) => ctx.set('criticality', 'HIGH'),
                isActive: (s) => (s.criticality ?? []).includes('HIGH'),
                clear: (ctx) => ctx.removeAll('criticality'),
            },
            {
                id: 'retired',
                apply: (ctx) => ctx.set('status', 'RETIRED'),
                isActive: (s) => (s.status ?? []).includes('RETIRED'),
                clear: (ctx) => ctx.removeAll('status'),
            },
        ],
        [],
    );
    const { activeKpiId: activeAssetKpi, toggle: toggleAssetKpi } =
        useKpiFilter(assetKpiDefs);

    // R10-PR7 — column-visibility gear.
    const assetColumnList = useMemo(
        () => [
            // First-column rule (Risk/Controls parity) — the
            // per-tenant `AST-N` Code leads, so the list scans by
            // canonical identifier first and Name second.
            { id: 'code', label: 'Code' },
            { id: 'name', label: 'Name' },
            { id: 'type', label: 'Type' },
            { id: 'classification', label: 'Classification' },
            { id: 'owner', label: 'Owner' },
            { id: 'cia', label: 'C/I/A' },
            { id: 'controls', label: 'Controls' },
        ],
        [],
    );
    const {
        columnVisibility,
        setColumnVisibility,
        orderColumns,
        dropdown: columnsDropdown,
    } = useColumnsDropdown({
        storageKey: 'inflect:col-vis:assets',
        columns: assetColumnList,
    });

    const assetColumns = useMemo(() => createColumns<any>([
        {
            // First-column convention — `AST-N` Code leads. Mono +
            // tabular-nums so the digits align column-wise; muted
            // tone keeps the canonical-id signal quiet while the
            // Name cell carries the click affordance.
            id: 'code',
            header: 'Code',
            // Args are inferred from the column generic — leaving
            // explicit annotations off keeps the type-narrowness
            // ratchet honest.
            accessorFn: (a) => a.key ?? null,
            cell: ({ getValue }) => {
                const k = getValue();
                return (
                    <span className="font-mono text-xs text-content-muted tabular-nums">
                        {k ?? '—'}
                    </span>
                );
            },
        },
        {
            accessorKey: 'name',
            header: t.name,
            // B2 — match Controls table standard: title cell is a
            // `<Link>` so single-click on the name navigates.
            cell: ({ row, getValue }: any) => (
                <TableTitleCell
                    href={tenantHref(`/assets/${row.original.id}`)}
                    id={`asset-link-${row.original.id}`}
                >
                    {getValue()}
                </TableTitleCell>
            ),
        },
        {
            accessorKey: 'type',
            header: t.type,
            cell: ({ getValue }: any) => <StatusBadge variant="info">{String(getValue()).replace(/_/g, ' ')}</StatusBadge>,
        },
        {
            id: 'classification',
            header: t.classification,
            accessorFn: (a: any) => a.classification || '—',
        },
        {
            id: 'owner',
            header: t.owner,
            accessorFn: (a: any) => a.owner || '—',
        },
        {
            id: 'cia',
            header: t.cia,
            accessorFn: (a: any) => `${a.confidentiality}/${a.integrity}/${a.availability}`,
            cell: ({ getValue }: any) => <span className="text-xs">{getValue()}</span>,
        },
        {
            id: 'controls',
            header: t.controlsCol,
            accessorFn: (a: any) => a._count?.controls || 0,
            cell: ({ getValue }: any) => <span className="text-xs">{getValue()}</span>,
        },
    ]), [t]);

    return (
        <ListPageShell className="gap-section">
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <PageBreadcrumbs
                            items={[
                                { label: 'Dashboard', href: tenantHref('/dashboard') },
                                { label: t.title },
                            ]}
                            className="mb-1"
                        />
                        <Heading level={1}>{t.title}</Heading>
                        {t.listDescription && (
                            <p className="text-sm text-content-muted mt-1">{t.listDescription}</p>
                        )}
                    </div>
                    <div className="flex gap-tight">
                        <Tooltip content="Coverage">
                            <Link href={tenantHref('/coverage')} aria-label="Coverage" className={buttonVariants({ variant: 'secondary', size: 'icon' })}><AppIcon name="shield" size={16} /></Link>
                        </Tooltip>
                        <Button variant="primary" icon={<Plus className="-ml-0.5 -mr-2.5" />} onClick={() => setIsCreateOpen(true)} id="new-asset-btn">{t.addAsset}</Button>
                    </div>
                </div>
            </ListPageShell.Header>

            <ListPageShell.Filters className="space-y-section">
                {/* R23-PR-D — KPI strip above the filter toolbar.
                    Mirrors the Risks-page reference layout exactly:
                    same grid, same gap, same KpiFilterCard primitive,
                    KPIs derived from filter state via useKpiFilter. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                    {visibleKpiCards.map((card) => {
                        const cfg: Record<
                            string,
                            {
                                value: number;
                                accent: 'indigo' | 'emerald' | 'rose' | 'slate';
                                sparkline?: typeof assetTrends.total;
                            }
                        > = {
                            total: {
                                value: totalAssets,
                                accent: 'indigo',
                                sparkline: assetTrends.total,
                            },
                            active: {
                                value: activeAssets,
                                accent: 'emerald',
                                sparkline: assetTrends.active,
                            },
                            critical: {
                                value: criticalAssets,
                                accent: 'rose',
                                sparkline: assetTrends.critical,
                            },
                            retired: {
                                value: retiredAssets,
                                accent: 'slate',
                                sparkline: assetTrends.retired,
                            },
                        };
                        const c = cfg[card.id];
                        if (!c) return null;
                        return (
                            <KpiFilterCard
                                key={card.id}
                                label={card.label}
                                value={c.value}
                                accent={c.accent}
                                sparkline={c.sparkline}
                                onClick={() =>
                                    toggleAssetKpi(card.id as AssetKpiId)
                                }
                                selected={activeAssetKpi === card.id}
                            />
                        );
                    })}
                </div>
                <FilterToolbar
                    filters={liveFilters}
                    searchId="assets-search"
                    searchPlaceholder="Search assets…"
                    actions={<>{columnsDropdown}{filtersDropdown}</>}
                />
            </ListPageShell.Filters>

            <ListPageShell.Body>
                <DataTable
                    fillBody
                    data={assets}
                    columns={orderColumns(assetColumns)}
                    getRowId={(a: any) => a.id}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    onRowClick={(row) => router.push(tenantHref(`/assets/${row.original.id}`))}
                    emptyState={
                        hasActive ? (
                            <EmptyState
                                size="sm"
                                variant="no-results"
                                title="No assets match your filters"
                                description="Try widening your search or clearing one of the active filters."
                                secondaryAction={{
                                    label: 'Clear filters',
                                    onClick: () => filterCtx.clearAll(),
                                }}
                            />
                        ) : (
                            <EmptyState
                                size="sm"
                                variant="no-records"
                                title={t.noAssets}
                                description="Register the systems, applications, and data stores in scope before mapping risks and controls."
                                primaryAction={
                                    permissions.canWrite
                                        ? {
                                              label: 'Add asset',
                                              onClick: () => setIsCreateOpen(true),
                                          }
                                        : undefined
                                }
                            />
                        )
                    }
                    resourceName={(p) => p ? 'assets' : 'asset'}
                    data-testid="assets-table"
                    className="hover:bg-bg-muted"
                />
            </ListPageShell.Body>

            <NewAssetModal
                open={isCreateOpen}
                setOpen={setIsCreateOpen}
                tenantSlug={tenantSlug}
                labels={{
                    name: t.name,
                    type: t.type,
                    classification: t.classification,
                    classificationPlaceholder: t.classificationPlaceholder,
                    owner: t.owner,
                    location: t.location,
                    dataResidency: t.dataResidency,
                    residencyPlaceholder: t.residencyPlaceholder,
                    confidentiality: t.confidentiality,
                    integrity: t.integrity,
                    availability: t.availability,
                    cancel: t.cancel,
                    createAsset: t.createAsset,
                    addAsset: t.addAsset,
                }}
            />
        </ListPageShell>
    );
}
