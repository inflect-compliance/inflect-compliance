'use client';
import { useState, useMemo, useEffect } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTenantSWR, usePrefetchTenant } from '@/lib/hooks/use-tenant-swr';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { DataTable, createColumns, useColumnsDropdown, sortRowsByDisplay, type SortAccessors } from '@/components/ui/table';
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
import { useThresholdLoadMore } from '@/components/ui/hooks';
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
import { useKpiTrends, buildKpiSparklines, centeredSparklineDomain } from '@/lib/charts/kpi-trends';
import { BulkActionBar, type BulkActionDef } from '@/components/ui/bulk-action-bar';
import { UserCombobox } from '@/components/ui/user-combobox';
import { Combobox } from '@/components/ui/combobox';
import { ownerDisplayName } from '@/lib/owner-display';
import { useKpiFilter, type KpiFilterDef } from '@/components/ui/kpi-filter';
import { Plus } from '@/components/ui/icons/nucleo';
import { NewAssetModal } from './NewAssetModal';
import { AssetDetailPanel } from './AssetDetailPanel';
import { AsidePanel } from '@/components/ui/aside-panel';
import { getAssetCriticality } from './_form/asset-criticality';
import { useKeyboardShortcut } from '@/lib/hooks/use-keyboard-shortcut';
import type { StatusBadgeVariant } from '@/components/ui/status-badge';

/** Item 34 — map the derived criticality tone to a StatusBadge variant. */
const CRITICALITY_VARIANT: Record<string, StatusBadgeVariant> = {
    critical: 'error',
    danger: 'error',
    warning: 'warning',
    success: 'success',
};

// listAssets → AssetRepository.list (full Asset model + _count.controls +
// usecase-added taskTotal/taskDone). Cells/KPI callbacks stay untyped
// (file-level disable; the colon-any category) — this types the column factory.
interface AssetListRow {
    id: string;
    key: string | null;
    name: string;
    type: string;
    classification: string | null;
    owner: string | null;
    confidentiality: number | null;
    integrity: number | null;
    availability: number | null;
    criticality: string | null;
    status: string;
    _count: { controls: number };
    taskTotal: number;
    taskDone: number;
}

interface AssetsClientProps {
    initialAssets: AssetListRow[];
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
    // `t` above is the server-threaded resolved-strings object (existing
    // pattern). `tx` is the live next-intl translator for the strings this
    // island localizes directly under the `assets` namespace.
    const tx = useTranslations('assets');
    // Modal-form follow-up — create-asset modal mounted off the list,
    // auto-opening on `?create=1` (the redirect target from
    // `/assets/new`). Matches the canonical NewVendorModal wiring.
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    // Item 32 — quick-look side panel: the id of the asset whose panel
    // is open (null = closed).
    const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
    const searchParams = useSearchParams();
    const router = useRouter();
    const prefetchData = usePrefetchTenant();
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

    const assetsKey = useMemo(() => {
        const qs = fetchParams.toString();
        return qs ? `${CACHE_KEYS.assets.list()}?${qs}` : CACHE_KEYS.assets.list();
    }, [fetchParams]);
    const assetsQuery = useTenantSWR<AssetListRow[]>(assetsKey, {
        fallbackData: filtersMatchInitial ? initialAssets : undefined,
    });
    const assets = assetsQuery.data ?? [];

    // ─── Sortable headers (per-column asc/desc, parity with Controls) ───
    // Clicking a sortable header re-orders the in-memory rows; sort runs
    // BEFORE the load-more window so the visible slice reflects the order.
    const [sortBy, setSortBy] = useState<string | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
        undefined,
    );
    const sortableColumns = useMemo(
        () => [
            'code', 'name', 'type', 'criticality',
            'classification', 'owner', 'controls', 'tasks',
        ],
        [],
    );
    // Sort accessors return the value each column DISPLAYS, so sorting groups
    // same-displayed-value rows contiguously and can never drift from the
    // rendered cell. The drift-prone columns are `type` (cell strips
    // underscores) and `tasks` (cell renders the `done/total` string while the
    // old comparator sorted by total only). `criticality` + `tasks` point
    // their column `accessorFn` at the SAME function below.
    const sortAccessors = useMemo<SortAccessors<AssetListRow>>(
        () => ({
            code: (a) => a.key || '',
            name: (a) => a.name || '',
            // Cell renders `String(type).replace(/_/g, ' ')` — sort on the same
            // de-underscored label, not the raw enum.
            type: (a) => (a.type ?? '').replace(/_/g, ' '),
            // Cell renders the derived criticality label; the numeric score is
            // monotonic with that label band, so sorting on the score keeps the
            // bands contiguous AND in true severity order.
            criticality: (a) =>
                getAssetCriticality(
                    a.confidentiality ?? 3,
                    a.integrity ?? 3,
                    a.availability ?? 3,
                ).score,
            classification: (a) => a.classification || '—',
            owner: (a) => a.owner || '—',
            controls: (a) => a._count?.controls || 0,
            // Cell renders the `done/total` fraction — sort on that, not total.
            tasks: (a) => `${a.taskDone ?? 0}/${a.taskTotal ?? 0}`,
        }),
        [],
    );
    const sortedAssets = useMemo(
        () => sortRowsByDisplay(assets, sortAccessors, sortBy, sortOrder),
        [assets, sortAccessors, sortBy, sortOrder],
    );

    // Load-on-scroll windowing — render the first batch, append more as
    // the user nears the bottom (DataTable onReachEnd sentinel).
    const {
        visibleRows: visibleAssets,
        hasMore: hasMoreAssets,
        loadMore: loadMoreAssets,
    } = useThresholdLoadMore(sortedAssets);

    // ─── Bulk actions (canonical BulkActionBar) ───
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkApplying, setBulkApplying] = useState(false);
    const handleBulkApply = async (action: string, value: string, _label: string) => {
        if (!action || selected.size === 0) return;
        setBulkApplying(true);
        try {
            const ids = Array.from(selected);
            const url =
                action === 'status'
                    ? apiUrl('/assets/bulk/status')
                    : action === 'delete'
                        ? apiUrl('/assets/bulk/delete')
                        : apiUrl('/assets/bulk/assign');
            const body =
                action === 'status'
                    ? { assetIds: ids, status: value }
                    : action === 'delete'
                        ? { assetIds: ids }
                        : { assetIds: ids, ownerUserId: value || null };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Bulk action failed');
            // Revalidate the same key the table reads (the active filtered list).
            await assetsQuery.mutate();
            setSelected(new Set());
        } finally {
            setBulkApplying(false);
        }
    };
    const assetBulkActions: BulkActionDef[] = useMemo(
        () => [
            {
                value: 'status',
                label: tx('bulk.setStatus'),
                canApply: (v) => v !== '',
                renderInput: ({ value, setValue }) => {
                    const statusOpts = [
                        { value: 'ACTIVE', label: tx('statusOption.ACTIVE') },
                        { value: 'RETIRED', label: tx('statusOption.RETIRED') },
                    ];
                    return (
                        <Combobox
                            hideSearch
                            id="bulk-value-input"
                            selected={statusOpts.find((o) => o.value === value) ?? null}
                            setSelected={(opt) => setValue(opt?.value ?? '')}
                            options={statusOpts}
                            placeholder={tx('bulk.selectStatus')}
                            matchTriggerWidth
                            buttonProps={{ className: 'text-sm' }}
                        />
                    );
                },
            },
            {
                value: 'assign',
                label: tx('bulk.assignOwner'),
                renderInput: ({ value, setValue, setLabel }) => (
                    <UserCombobox
                        tenantSlug={tenantSlug}
                        selectedId={value || null}
                        onChange={(id, m) => {
                            setValue(id ?? '');
                            setLabel(ownerDisplayName(m?.name, m?.email) ?? '');
                        }}
                        forceDropdown
                        matchTriggerWidth
                        placeholder={tx('bulk.ownerPlaceholder')}
                        className="w-full sm:w-44"
                        id="bulk-value-input"
                    />
                ),
            },
            { value: 'delete', label: tx('bulk.delete'), confirm: true },
        ],
        [tenantSlug, tx],
    );

    // Item 32 — the asset row backing the open quick-look panel.
    const selectedAsset =
        selectedAssetId != null
            ? assets.find((a: { id: string }) => a.id === selectedAssetId) ?? null
            : null;

    // Quick-look right-rail — the same docked `<AsidePanel>` the Controls +
    // Tasks lists use (co-resident with the table on ≥xl, Sheet below xl), NOT
    // a blocking overlay. Keyed by asset id so switching rows forces a fresh
    // mount → openOnMount re-fires and the panel re-seeds from the new row.
    const assetQuickViewAside = selectedAsset ? (
        <AsidePanel
            key={`qv-asset-${selectedAsset.id}`}
            title={selectedAsset.name}
            surfaceKey="assets-quickview"
            defaultWidth={360}
            openOnMount
            onClose={() => setSelectedAssetId(null)}
        >
            <AssetDetailPanel asset={selectedAsset} tenantHref={tenantHref} />
        </AsidePanel>
    ) : null;

    // Item 27 — ↑/↓ move the panel selection to the previous/next asset
    // in the current (filtered, sorted) list while the panel stays open,
    // so a reviewer can walk the register without reaching for the mouse.
    // Only active while the panel is open; clamped at the ends.
    const moveSelection = (delta: number) => {
        if (selectedAssetId == null || assets.length === 0) return;
        const idx = assets.findIndex((a: { id: string }) => a.id === selectedAssetId);
        if (idx === -1) return;
        const next = Math.min(assets.length - 1, Math.max(0, idx + delta));
        setSelectedAssetId(assets[next].id);
    };
    useKeyboardShortcut('ArrowDown', () => moveSelection(1), {
        enabled: selectedAssetId != null,
        description: tx('shortcutNextAsset'),
    });
    useKeyboardShortcut('ArrowUp', () => moveSelection(-1), {
        enabled: selectedAssetId != null,
        description: tx('shortcutPrevAsset'),
    });

    const tGroup = useTranslations('common.filterGroups');
    const liveFilters = useMemo(
        () =>
            buildAssetFilters(
                (k, v) => tx(k as Parameters<typeof tx>[0], v as Parameters<typeof tx>[1]),
                (k) => tGroup(k as Parameters<typeof tGroup>[0]),
            ),
        [tx, tGroup],
    );
    // R-filter-gear (#3, 2026-06-07) — the gear controls the quantifiable
    // KPI cards (Total / Active / High criticality / Retired), not the
    // filter categories (which stay in the Filter dropdown).
    const kpiCards: CardDefinition[] = useMemo(
        () => [
            { id: 'total', label: tx('kpi.total'), kind: 'kpi' },
            { id: 'active', label: tx('kpi.active'), kind: 'kpi' },
            { id: 'critical', label: tx('kpi.highCriticality'), kind: 'kpi' },
            { id: 'retired', label: tx('kpi.retired'), kind: 'kpi' },
        ],
        [tx],
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
    const activeAssets = assets.filter((a) => a.status === 'ACTIVE').length;
    // guardrail-ignore: KPI count, not a refilter.
    const criticalAssets = assets.filter((a) => a.criticality === 'HIGH').length;
    // guardrail-ignore: KPI count, not a refilter.
    const retiredAssets = assets.filter((a) => a.status === 'RETIRED').length;

    // Sparkline data per KPI — cumulative count by `createdAt`, so each
    // tile shows how its current number was built up over time. Derived
    // KPI sparklines are a REAL per-day series from the daily
    // compliance-snapshot job (one frozen point per 24h), not a
    // client-side replay of the loaded rows. Same endpoint + snapshot
    // table the executive dashboard trend uses. A fresh tenant (or the
    // first day after this shipped) returns <2 points → cards render
    // without a sparkline until history accrues.
    // Canonical KPI-trends pipeline (shared across every entity's KPI cards):
    // one cached /dashboard/trends fetch + a truthful per-card series builder
    // that trims the leading defaulted-zero prefix (gated on assetsTotal>0) so
    // a metric's pre-existence history doesn't render as a fake ramp. Each
    // card centres its own domain at render via centeredSparklineDomain.
    const trendsQuery = useKpiTrends(tenantSlug);
    const assetTrends = useMemo(
        () =>
            buildKpiSparklines(trendsQuery.data?.dataPoints, (d) => d.assetsTotal, {
                total: (d) => d.assetsTotal,
                active: (d) => d.assetsActive,
                critical: (d) => d.assetsHighCriticality,
                retired: (d) => d.assetsRetired,
            }),
        [trendsQuery.data],
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
            // per-tenant `AST-N` Code leads the column DEFS, but is off by
            // default — toggle it on via the gear. Name is the default lead.
            { id: 'code', label: tx('colVis.code'), defaultVisible: false },
            { id: 'name', label: tx('colVis.name') },
            { id: 'type', label: tx('colVis.type') },
            // Item 34 — the derived criticality (top-two-mean of C/I/A)
            // leads the risk-relevant columns; classification is demoted
            // off-by-default since criticality is the operative signal for
            // prioritisation and classification duplicates much of it.
            { id: 'criticality', label: tx('colVis.criticality') },
            { id: 'classification', label: tx('colVis.classification'), defaultVisible: false },
            { id: 'owner', label: tx('colVis.owner') },
            { id: 'controls', label: tx('colVis.controls') },
            { id: 'tasks', label: tx('colVis.tasks') },
        ],
        [tx],
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

    const assetColumns = useMemo(() => createColumns<AssetListRow>([
        {
            // First-column convention — `AST-N` Code leads. Mono +
            // tabular-nums so the digits align column-wise; muted
            // tone keeps the canonical-id signal quiet while the
            // Name cell carries the click affordance.
            id: 'code',
            header: tx('colHeaders.code'),
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
            // Interaction model: a single click on the TITLE opens the
            // quick-look side panel. It's a <button>, so the table's
            // isClickOnInteractiveChild() skips the row's select/navigate
            // handlers for title clicks — the title never toggles selection
            // or navigates to the full page (those are the row's job:
            // single-click row = select, double-click row = full view).
            cell: ({ row, getValue }) => (
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        setSelectedAssetId(row.original.id);
                    }}
                    // `inline-block max-w-full` (NOT `block w-full`) — the
                    // quick-look trigger's footprint hugs the NAME text, not
                    // the whole cell. With a full-cell button the pointer
                    // cursor + the brand-tint hover landed anywhere in the
                    // cell; Controls/Risks render the title as an INLINE
                    // <Link> (footprint = the text), so hover/cursor scope to
                    // the name only. This matches that. `max-w-full` keeps a
                    // long name inside the column; `truncate` clips overflow.
                    className="inline-block max-w-full cursor-pointer truncate text-left align-middle rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    data-testid={`asset-title-${row.original.id}`}
                >
                    {/* tintOn="self" — the name tints brand-color only when the
                        name itself is hovered (not the whole row/cell),
                        matching the Controls + Risks title links. */}
                    <TableTitleCell tintOn="self">{getValue()}</TableTitleCell>
                </button>
            ),
        },
        {
            accessorKey: 'type',
            header: t.type,
            cell: ({ getValue }) => <StatusBadge variant="info" size="sm">{String(getValue()).replace(/_/g, ' ')}</StatusBadge>,
        },
        {
            // Item 34 — derived criticality (top-two-mean of C/I/A with a
            // critical-ceiling override), shown as a toned badge.
            id: 'criticality',
            header: tx('colHeaders.criticality'),
            accessorFn: sortAccessors.criticality,
            cell: ({ row }) => {
                const crit = getAssetCriticality(
                    row.original.confidentiality ?? 3,
                    row.original.integrity ?? 3,
                    row.original.availability ?? 3,
                );
                return (
                    <StatusBadge variant={CRITICALITY_VARIANT[crit.tone] ?? 'neutral'} size="sm">
                        {crit.label}
                    </StatusBadge>
                );
            },
        },
        {
            id: 'classification',
            header: t.classification,
            accessorFn: (a) => a.classification || '—',
        },
        {
            id: 'owner',
            header: t.owner,
            accessorFn: (a) => a.owner || '—',
        },
        {
            id: 'controls',
            header: t.controlsCol,
            accessorFn: (a) => a._count?.controls || 0,
            cell: ({ getValue }) => <span className="text-xs">{getValue()}</span>,
        },
        {
            // B7 — unified linked-task count (done/total), matching Controls.
            id: 'tasks',
            header: tx('colHeaders.tasks'),
            accessorFn: sortAccessors.tasks,
            cell: ({ row }) => {
                const total = row.original.taskTotal ?? 0;
                const done = row.original.taskDone ?? 0;
                return (
                    <span
                        className={
                            total > 0 && done === total
                                ? 'text-content-success text-xs'
                                : 'text-content-muted text-xs'
                        }
                    >
                        {done}/{total}
                    </span>
                );
            },
        },
    ]), [t, tx, sortAccessors]);

    return (
        <ListPageShell className="animate-fadeIn gap-section">
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <PageBreadcrumbs
                            items={[
                                { label: tx('breadcrumbDashboard'), href: tenantHref('/dashboard') },
                                { label: t.title },
                            ]}
                            className="mb-1"
                        />
                        <Heading level={1} className="sr-only">{t.title}</Heading>
                        {t.listDescription && (
                            <p className="text-sm text-content-muted mt-1">{t.listDescription}</p>
                        )}
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
                                sparklineDomain={centeredSparklineDomain(c.sparkline)}
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
                    searchPlaceholder={tx('searchPlaceholder')}
                    leading={
                        <Button variant="primary" icon={<Plus className="-ml-0.5 -mr-2.5" />} onClick={() => setIsCreateOpen(true)} id="new-asset-btn">{t.addAsset}</Button>
                    }
                    actions={
                        <>
                            <Tooltip content={tx('coverageTooltip')}>
                                <Link href={tenantHref('/coverage')} aria-label={tx('coverageTooltip')} className={buttonVariants({ variant: 'secondary', size: 'icon' })}><AppIcon name="shield" size={16} /></Link>
                            </Tooltip>
                            {columnsDropdown}
                            {filtersDropdown}
                        </>
                    }
                />
            </ListPageShell.Filters>

            <ListPageShell.Body aside={assetQuickViewAside}>
                <DataTable
                    fillBody
                    onReachEnd={hasMoreAssets ? loadMoreAssets : undefined}
                    data={visibleAssets}
                    columns={orderColumns(assetColumns)}
                    sortableColumns={sortableColumns}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={({ sortBy: nextBy, sortOrder: nextOrder }) => {
                        setSortBy(nextBy);
                        setSortOrder(nextOrder);
                    }}
                    getRowId={(a) => a.id}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    // Three-way interaction model:
                    //   • single-click TITLE   → quick-look side panel (the
                    //     title <button> owns this; see the name column cell).
                    //   • single-click ROW     → select the row; the selection
                    //     action row replaces the column headers.
                    //   • double-click ROW     → full detail page.
                    // With selectionEnabled on, the DataTable gives single
                    // click to selection and fires onRowClick on double-click —
                    // so onRowClick is the "full view" navigation.
                    selectionEnabled
                    selectedRows={Object.fromEntries(
                        Array.from(selected).map((id) => [id, true]),
                    )}
                    onRowSelectionChange={(rows) =>
                        setSelected(new Set(rows.map((r) => r.original.id)))
                    }
                    selectionControls={() => (
                        <BulkActionBar
                            actions={assetBulkActions}
                            onApply={handleBulkApply}
                            applying={bulkApplying}
                            selectedCount={selected.size}
                            entityLabel={tx('entityLabelPlural')}
                        />
                    )}
                    onRowClick={(row) =>
                        router.push(tenantHref(`/assets/${row.original.id}`))
                    }
                    onRowPrefetch={(row) => { router.prefetch(tenantHref(`/assets/${row.original.id}`)); prefetchData(`/assets/${row.original.id}`); }}
                    emptyState={
                        hasActive ? (
                            <EmptyState
                                size="sm"
                                variant="no-results"
                                title={tx('empty.noResultsTitle')}
                                description={tx('empty.filtersHint')}
                                secondaryAction={{
                                    label: tx('empty.clearFilters'),
                                    onClick: () => filterCtx.clearAll(),
                                }}
                            />
                        ) : (
                            <EmptyState
                                size="sm"
                                variant="no-records"
                                title={t.noAssets}
                                description={tx('empty.recordsHint')}
                                primaryAction={
                                    permissions.canWrite
                                        ? {
                                              label: tx('empty.addAssetAction'),
                                              onClick: () => setIsCreateOpen(true),
                                          }
                                        : undefined
                                }
                            />
                        )
                    }
                    resourceName={(p) => p ? tx('entityLabelPlural') : tx('entityLabel')}
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
