'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

import { formatDate } from '@/lib/format-date';
import { useEffect, useMemo, useState, useCallback } from 'react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { DataTable, createColumns, useColumnsDropdown, sortRowsByDisplay, type SortAccessors } from '@/components/ui/table';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { useRouter } from 'next/navigation';
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { BulkActionBar, type BulkActionDef } from '@/components/ui/bulk-action-bar';
import { UserCombobox } from '@/components/ui/user-combobox';
import { Combobox } from '@/components/ui/combobox';
import { ownerDisplayName } from '@/lib/owner-display';
import { buttonVariants } from '@/components/ui/button-variants';
import { FilterProvider, useFilterContext, useFilters, useFilterCardVisibility, filtersToCards, selectVisibleFilters } from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { useKpiFilter, type KpiFilterDef } from '@/components/ui/kpi-filter';
import { useKpiTrends, buildKpiSparklines, buildKpiSparklineNullable, centeredSparklineDomain, assignSparklineVariants } from '@/lib/charts/kpi-trends';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { AppIcon } from '@/components/icons/AppIcon';
import { Tooltip } from '@/components/ui/tooltip';
import { buildTestFilters, TEST_FILTER_KEYS } from './filter-defs';

/** Bulk-action status options (canonical BulkActionBar). */
const TEST_PLAN_STATUS_OPTIONS = [
    { value: 'ACTIVE', label: 'Active' },
    { value: 'PAUSED', label: 'Paused' },
    { value: 'ARCHIVED', label: 'Archived' },
];

interface TestPlanSummary {
    id: string;
    name: string;
    frequency: string;
    status: string;
    nextDueAt: string | null;
    controlId: string;
    method: string;
    control: { id: string; name: string; code: string | null };
    owner?: { id: string; name: string | null; email: string } | null;
    _count?: { runs: number; steps: number };
    runs?: Array<{
        id: string;
        result: string | null;
        executedAt: string | null;
        status: string;
    }>;
}

const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};
const RESULT_BADGE: Record<string, StatusBadgeVariant> = {
    PASS: 'success', FAIL: 'error', INCONCLUSIVE: 'warning',
};
// Audit Coherence S2 — TestPlanStatus values: ACTIVE / PAUSED /
// ARCHIVED. ARCHIVED is the terminal "retired control test" state
// (preserved for historical audit, no new runs). Pre-S2 the UI
// only knew about ACTIVE / PAUSED.
const PLAN_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    ACTIVE: 'success',
    PAUSED: 'warning',
    ARCHIVED: 'neutral',
};

const isOverdue = (d: string | null) => {
    if (!d) return false;
    return new Date(d) < new Date();
};

const getLastResult = (plan: TestPlanSummary) => {
    if (!plan.runs || plan.runs.length === 0) return null;
    return plan.runs[0]?.result;
};

export default function TestsRollupPage() {
    // Filter state lives in the URL-synced filter context; the page
    // filters its in-memory plan list off `state` + `search`.
    const filterCtx = useFilterContext([], TEST_FILTER_KEYS, {});
    return (
        <FilterProvider value={filterCtx}>
            <TestsRollupContent />
        </FilterProvider>
    );
}

function TestsRollupContent() {
    const t = useTranslations('controlTests');
    const tGroup = useTranslations('common.filterGroups');
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { tenantSlug } = useTenantContext();
    const router = useRouter();
    const { state, search, hasActive } = useFilters();

    const [plans, setPlans] = useState<TestPlanSummary[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(apiUrl('/tests/plans'));
            if (res.ok) setPlans(await res.json());
        } finally {
            setLoading(false);
        }
    }, [apiUrl]);

    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { fetchData(); }, [fetchData]);

    // ─── Bulk actions (canonical BulkActionBar) ───
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkApplying, setBulkApplying] = useState(false);
    const handleBulkApply = async (action: string, value: string) => {
        const ids = Array.from(selected);
        if (!action || ids.length === 0) return;
        setBulkApplying(true);
        try {
            const url = action === 'status'
                ? apiUrl('/tests/plans/bulk/status')
                : action === 'delete'
                    ? apiUrl('/tests/plans/bulk/delete')
                    : apiUrl('/tests/plans/bulk/assign');
            const body =
                action === 'status'
                    ? { planIds: ids, status: value }
                    : action === 'delete'
                        ? { planIds: ids }
                        : { planIds: ids, ownerUserId: value || null };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(t('list.bulkFailed'));
            await fetchData();
            setSelected(new Set());
        } finally {
            setBulkApplying(false);
        }
    };
    const testBulkActions: BulkActionDef[] = useMemo(
        () => [
            {
                value: 'status',
                label: t('bulk.setStatus'),
                canApply: (v) => v !== '',
                renderInput: ({ value, setValue }) => (
                    <Combobox
                        hideSearch
                        id="bulk-value-input"
                        selected={TEST_PLAN_STATUS_OPTIONS.find((o) => o.value === value) ?? null}
                        setSelected={(opt) => setValue(opt?.value ?? '')}
                        options={TEST_PLAN_STATUS_OPTIONS}
                        placeholder={t('bulk.selectStatus')}
                        matchTriggerWidth
                        buttonProps={{ className: 'text-sm' }}
                    />
                ),
            },
            {
                value: 'assign',
                label: t('bulk.assignOwner'),
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
                        placeholder={t('bulk.ownerPlaceholder')}
                        className="w-full sm:w-44"
                        id="bulk-value-input"
                    />
                ),
            },
            { value: 'delete', label: t('bulk.delete'), confirm: true },
        ],
        [t, tenantSlug],
    );

    // ── Column-visibility gear (Epic 52/R10) ──
    const {
        columnVisibility,
        setColumnVisibility,
        orderColumns,
        dropdown: columnsDropdown,
    } = useColumnsDropdown({
        storageKey: 'inflect:col-vis:tests',
        columns: [
            { id: 'name', label: t('colHeaders.name') },
            { id: 'status', label: t('colHeaders.status') },
            { id: 'control', label: t('colHeaders.control') },
            { id: 'frequency', label: t('colHeaders.frequency') },
            { id: 'nextDue', label: t('colHeaders.nextDue') },
            { id: 'lastResult', label: t('colHeaders.lastResult') },
            { id: 'runs', label: t('colHeaders.runs') },
        ],
    });

    const liveFilters = useMemo(
        () =>
            buildTestFilters(
                (k, v) => t(k as Parameters<typeof t>[0], v as Parameters<typeof t>[1]),
                (k) => tGroup(k as Parameters<typeof tGroup>[0]),
            ),
        [t, tGroup],
    );

    const filterCards = useMemo(() => filtersToCards(liveFilters), [liveFilters]);
    const { visibleCards, dropdown: filtersDropdown } = useFilterCardVisibility({
        storageKey: 'inflect:filter-vis:tests',
        cards: filterCards,
    });
    const visibleFilterDefs = useMemo(
        () => selectVisibleFilters(visibleCards, liveFilters),
        [visibleCards, liveFilters],
    );

    // ── Client-side filtering from the filter context ──
    const filteredPlans = useMemo(() => {
        const statusSel = state.status ?? [];
        const resultSel = state.result ?? [];
        const freqSel = state.frequency ?? [];
        const dueSel = state.due ?? [];
        const q = search.trim().toLowerCase();
        return plans.filter((p) => {
            if (statusSel.length && !statusSel.includes(p.status)) return false;
            const result = getLastResult(p) ?? 'NONE';
            if (resultSel.length && !resultSel.includes(result)) return false;
            if (freqSel.length && !freqSel.includes(p.frequency)) return false;
            if (
                dueSel.includes('overdue') &&
                !(p.nextDueAt && isOverdue(p.nextDueAt))
            ) {
                return false;
            }
            if (q && !p.name.toLowerCase().includes(q)) return false;
            return true;
        });
    }, [plans, state, search]);

    // ─── Sortable headers (per-column asc/desc, parity with Controls) ───
    const [sortBy, setSortBy] = useState<string | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
        undefined,
    );
    const sortableColumns = useMemo(
        () => ['name', 'status', 'control', 'frequency', 'nextDue', 'lastResult', 'runs'],
        [],
    );
    // Each accessor returns the value its column DISPLAYS, so sorting groups
    // same-displayed-value rows contiguously (case-insensitive via the shared
    // helper's locale compare).
    const sortAccessors = useMemo<SortAccessors<TestPlanSummary>>(
        () => ({
            name: (p) => p.name ?? '',
            status: (p) => p.status ?? '',
            control: (p) => p.control?.code || p.control?.name || '',
            frequency: (p) => FREQ_LABELS[p.frequency] || p.frequency || '',
            nextDue: (p) => p.nextDueAt ?? '',
            lastResult: (p) => getLastResult(p) || '',
            runs: (p) => p._count?.runs ?? 0,
        }),
        [],
    );
    const sortedPlans = useMemo(
        () => sortRowsByDisplay(filteredPlans, sortAccessors, sortBy, sortOrder),
        [filteredPlans, sortAccessors, sortBy, sortOrder],
    );

    // KPI-card counts — total + the three TestPlanStatus buckets. These power
    // the clickable KpiFilterCard row (each toggles the table's status filter).
    const totalPlans = plans.length;
    const activePlans = plans.filter((p) => p.status === 'ACTIVE').length;
    const pausedPlans = plans.filter((p) => p.status === 'PAUSED').length;
    const archivedPlans = plans.filter((p) => p.status === 'ARCHIVED').length;

    // Canonical KPI-card sparklines (shared hook). total is an always-present
    // series; active/paused/archived are forward-only nullable columns (PR3) —
    // empty until ~2 days of snapshot history accrue, never a fake ramp.
    const trendsQuery = useKpiTrends(tenantSlug);
    const testTrends = useMemo(() => {
        const points = trendsQuery.data?.dataPoints;
        const base = buildKpiSparklines(points, (d) => d.testPlansTotal, {
            total: (d) => d.testPlansTotal,
        });
        return {
            ...base,
            active: buildKpiSparklineNullable(points, (d) => d.testPlansActive),
            paused: buildKpiSparklineNullable(points, (d) => d.testPlansPaused),
            archived: buildKpiSparklineNullable(points, (d) => d.testPlansArchived),
        };
    }, [trendsQuery.data]);
    // Distinct sparkline colour per card (canonical allocator).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const sparkColors = useMemo(
        () => assignSparklineVariants(['total', 'active', 'paused', 'archived']),
        [],
    );

    // Clickable-KPI → table-filter wiring. "Total" clears all filters; each
    // status card toggles the `status` filter to its bucket (mutually
    // exclusive — the hook clears sibling status keys before applying).
    type TestKpiId = 'total' | 'active' | 'paused' | 'archived';
    const testKpiDefs: ReadonlyArray<KpiFilterDef<TestKpiId>> = useMemo(
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
                id: 'paused',
                apply: (ctx) => ctx.set('status', 'PAUSED'),
                isActive: (s) => (s.status ?? []).includes('PAUSED'),
                clear: (ctx) => ctx.removeAll('status'),
            },
            {
                id: 'archived',
                apply: (ctx) => ctx.set('status', 'ARCHIVED'),
                isActive: (s) => (s.status ?? []).includes('ARCHIVED'),
                clear: (ctx) => ctx.removeAll('status'),
            },
        ],
        [],
    );
    const { activeKpiId: activeTestKpi, toggle: toggleTestKpi } =
        useKpiFilter(testKpiDefs);

    const planColumns = useMemo(
        () =>
            orderColumns(createColumns<TestPlanSummary>([
                {
                    id: 'name', header: t('colHeaders.name'), accessorKey: 'name',
                    cell: ({ row }) => (
                        <Link
                            href={tenantHref(`/controls/${row.original.control.id}/tests/${row.original.id}`)}
                            className="text-content-emphasis font-medium hover:text-[var(--brand-default)] transition"
                        >
                            {row.original.name}
                        </Link>
                    ),
                },
                {
                    id: 'status', header: t('colHeaders.status'), accessorKey: 'status',
                    cell: ({ row }) => (
                        <StatusBadge variant={PLAN_STATUS_BADGE[row.original.status] ?? 'neutral'} size="sm">
                            {row.original.status}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'control', header: t('colHeaders.control'), accessorFn: (p) => p.control?.code || p.control?.name || '—',
                    cell: ({ row }) => (
                        <Link href={tenantHref(`/controls/${row.original.control.id}`)} className="text-content-muted hover:text-content-emphasis text-xs transition">
                            {row.original.control?.code || row.original.control?.name || '—'}
                        </Link>
                    ),
                },
                { id: 'frequency', header: t('colHeaders.frequency'), accessorFn: (p) => FREQ_LABELS[p.frequency] || p.frequency },
                {
                    id: 'nextDue', header: t('colHeaders.nextDue'), accessorKey: 'nextDueAt',
                    cell: ({ row }) => row.original.nextDueAt ? (
                        <span className={isOverdue(row.original.nextDueAt) ? 'text-content-error font-semibold' : 'text-content-muted'}>
                            {formatDate(row.original.nextDueAt)}
                        </span>
                    ) : <span className="text-content-subtle">—</span>,
                },
                {
                    id: 'lastResult', header: t('colHeaders.lastResult'),
                    accessorFn: (p) => getLastResult(p) || '',
                    cell: ({ row }) => {
                        const result = getLastResult(row.original);
                        return result ? (
                            <StatusBadge variant={RESULT_BADGE[result] || 'neutral'} size="sm">{result}</StatusBadge>
                        ) : <span className="text-content-subtle text-xs">{t('list.noRuns')}</span>;
                    },
                },
                {
                    id: 'runs', header: t('colHeaders.runs'),
                    accessorFn: (p) => p._count?.runs ?? 0,
                    cell: ({ getValue }) => <span className="text-content-subtle">{getValue() as number}</span>,
                },
            ])),
        [t, tenantHref, orderColumns],
    );

    if (loading) return <div className="p-12 text-center text-content-subtle animate-pulse">{t('list.loading')}</div>;

    return (
        <ListPageShell className="animate-fadeIn gap-section">
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <PageBreadcrumbs
                            items={[
                                { label: t('crumb.dashboard'), href: tenantHref('/dashboard') },
                                { label: t('crumb.tests') },
                            ]}
                            className="mb-1"
                        />
                        <Heading level={1} id="tests-page-title" className="sr-only">{t('list.title')}</Heading>
                        <p className="text-sm text-content-muted mt-1">{t('list.description')}</p>
                    </div>
                    {/* Nav icon buttons moved into the FilterToolbar's actions
                        slot (left of the column/filter gears), so the header
                        action cluster is now empty — matches the other entity
                        list pages (UI batch items 4-6). */}
                </div>
            </ListPageShell.Header>

            <ListPageShell.Filters className="space-y-section">
                {/* KPI strip — clickable cards filter the table by status. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                    <KpiFilterCard
                        label={t('kpi.total')}
                        value={totalPlans}
                        sparkline={testTrends.total}
                        sparklineVariant={sparkColors.total}
                        sparklineDomain={centeredSparklineDomain(testTrends.total)}
                        onClick={() => toggleTestKpi('total')}
                        selected={activeTestKpi === 'total'}
                    />
                    <KpiFilterCard
                        label={t('kpi.active')}
                        value={activePlans}
                        tone="success"
                        sparkline={testTrends.active}
                        sparklineVariant={sparkColors.active}
                        sparklineDomain={centeredSparklineDomain(testTrends.active)}
                        onClick={() => toggleTestKpi('active')}
                        selected={activeTestKpi === 'active'}
                    />
                    <KpiFilterCard
                        label={t('kpi.paused')}
                        value={pausedPlans}
                        tone={pausedPlans > 0 ? 'attention' : 'default'}
                        sparkline={testTrends.paused}
                        sparklineVariant={sparkColors.paused}
                        sparklineDomain={centeredSparklineDomain(testTrends.paused)}
                        onClick={() => toggleTestKpi('paused')}
                        selected={activeTestKpi === 'paused'}
                    />
                    <KpiFilterCard
                        label={t('kpi.archived')}
                        value={archivedPlans}
                        sparkline={testTrends.archived}
                        sparklineVariant={sparkColors.archived}
                        sparklineDomain={centeredSparklineDomain(testTrends.archived)}
                        onClick={() => toggleTestKpi('archived')}
                        selected={activeTestKpi === 'archived'}
                    />
                </div>

                {/* Filter bar (Status / Last Result / Frequency / Due) +
                    live content search + column-visibility gear. Replaces
                    the old All/Overdue/Failed toggle blade. */}
                <FilterToolbar
                    filters={visibleFilterDefs}
                    searchId="tests-search"
                    searchPlaceholder={t('list.searchPlaceholder')}
                    actions={
                        <>
                            <Tooltip content={t('nav.dueQueue')}>
                                <Link href={tenantHref('/tests/due')} aria-label={t('nav.dueQueue')} className={buttonVariants({ variant: 'secondary', size: 'icon' })} id="tests-due-btn">
                                    <AppIcon name="clock" size={16} />
                                </Link>
                            </Tooltip>
                            <Tooltip content={t('nav.dashboard')}>
                                <Link href={tenantHref('/tests/dashboard')} aria-label={t('nav.dashboard')} className={buttonVariants({ variant: 'secondary', size: 'icon' })} id="tests-dashboard-btn">
                                    <AppIcon name="dashboard" size={16} />
                                </Link>
                            </Tooltip>
                            <Tooltip content={t('nav.accessReviews')}>
                                <Link href={tenantHref('/access-reviews')} aria-label={t('nav.accessReviews')} className={buttonVariants({ variant: 'secondary', size: 'icon' })} id="tests-uar-btn">
                                    <AppIcon name="userCheck" size={16} />
                                </Link>
                            </Tooltip>
                            {columnsDropdown}{filtersDropdown}
                        </>
                    }
                />
            </ListPageShell.Filters>

            <ListPageShell.Body>
                <DataTable
                    fillBody
                    data={sortedPlans}
                    columns={planColumns}
                    sortableColumns={sortableColumns}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={({ sortBy: nextBy, sortOrder: nextOrder }) => {
                        setSortBy(nextBy);
                        setSortOrder(nextOrder);
                    }}
                    getRowId={(p) => p.id}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    selectionEnabled
                    selectedRows={Object.fromEntries(
                        Array.from(selected).map((id) => [id, true]),
                    )}
                    onRowSelectionChange={(rows) =>
                        setSelected(new Set(rows.map((r) => r.original.id)))
                    }
                    selectionControls={() => (
                        <BulkActionBar
                            actions={testBulkActions}
                            onApply={handleBulkApply}
                            applying={bulkApplying}
                            selectedCount={selected.size}
                            entityLabel={t('list.entityPlural')}
                        />
                    )}
                    emptyState={
                        hasActive
                            ? t('list.emptyFiltered')
                            : t('list.emptyNone')
                    }
                    resourceName={(p) => p ? t('list.entityPlural') : t('list.entitySingular')}
                    data-testid="tests-rollup-table"
                    // Row hover band + brand left-band (and double-click →
                    // open the plan), matching every other list table.
                    onRowClick={(row) =>
                        router.push(
                            tenantHref(
                                `/controls/${row.original.control.id}/tests/${row.original.id}`,
                            ),
                        )
                    }
                />
            </ListPageShell.Body>
        </ListPageShell>
    );
}
