'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

/* eslint-disable react-hooks/exhaustive-deps -- Various useMemo dep arrays in this file deliberately omit identity-unstable callbacks (handlers/derived arrays recreated each render). The proper structural fix is wrapping parent-level callbacks in useCallback. Tracked as follow-up; existing per-line eslint-disable-next-line markers preserved. */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTenantSWR, usePrefetchTenant } from '@/lib/hooks/use-tenant-swr';
import { ownerDisplayName } from '@/lib/owner-display';
import { BulkActionBar, type BulkActionDef } from '@/components/ui/bulk-action-bar';
import { UserCombobox } from '@/components/ui/user-combobox';
import { Combobox } from '@/components/ui/combobox';
import { useKpiTrends, buildKpiSparklines, buildKpiSparklineNullable, centeredSparklineDomain, assignSparklineVariants } from '@/lib/charts/kpi-trends';
import { CACHE_KEYS } from '@/lib/swr-keys';
import type { CappedList } from '@/lib/list-backfill-cap';
import { TruncationBanner } from '@/components/ui/TruncationBanner';
// NOTE: NewRiskModal was previously lazy-loaded via next/dynamic, but
// the JIT race in `next dev` made the modal occasionally fail to mount
// in serial-mode E2E runs (Playwright clicked the button before the
// chunk finished compiling, leaving #risk-title undetected). Static
// import — modal is small, the page bundle cost is negligible, and the
// E2E suite becomes deterministic.
import { NewRiskModal } from './NewRiskModal';
import { canonicalTreatmentLabel } from './_shared/risk-options';
import { Button } from '@/components/ui/button';
import { Tooltip } from '@/components/ui/tooltip';
import { AppIcon, type AppIconName } from '@/components/icons/AppIcon';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import { buttonVariants } from '@/components/ui/button-variants';
import { EmptyState } from '@/components/ui/empty-state';
import { RiskFirstRunEmpty } from '@/components/risks/RiskFirstRunEmpty';
import {
    DataTable,
    createColumns,
    useColumnsDropdown,
    sortRowsByDisplay,
    type SortAccessors,
} from '@/components/ui/table';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
    useFilterCardVisibility,
    type CardDefinition,
    type FilterType,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { useThresholdLoadMore } from '@/components/ui/hooks';
import { AsidePanel } from '@/components/ui/aside-panel';
import { AiAssistRail } from '@/components/ui/ai-assist-rail';
import { Sparkle3 } from '@/components/ui/icons/nucleo/sparkle3';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import {
    buildRiskFilters,
    RISK_API_TRANSFORMS,
    RISK_FILTER_KEYS,
} from './filter-defs';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';
import dynamic from 'next/dynamic';
import { Skeleton } from '@/components/ui/skeleton';
import { resolveBandForScore } from '@/lib/risk-matrix/scoring';
import type { RiskMatrixConfigShape } from '@/lib/risk-matrix/types';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { useKpiFilter, type KpiFilterDef } from '@/components/ui/kpi-filter';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { Plus } from '@/components/ui/icons/nucleo';
import { RiskScoreExplainer } from '@/components/RiskScoreExplainer';
import { resolveALE } from '@/app-layer/usecases/fair-calculator';
import { formatCompactCurrency } from '@/lib/risk-coherence';
import { formatTailAwareAle } from '@/lib/tail-language';
import { detectCellCollisions } from '@/lib/risk-collisions';
import { AleHistogram, type AleHistogramDatum } from '@/components/ui/charts';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useLocalStorage } from '@/components/ui/hooks';
import { useTranslations } from 'next-intl';

/** Bulk-action status options (canonical BulkActionBar). Labels resolve
 *  through the `risks.bulkStatus.*` catalog inside the component. */
const RISK_STATUS_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
    { value: 'OPEN', labelKey: 'bulkStatus.open' },
    { value: 'MITIGATING', labelKey: 'bulkStatus.mitigating' },
    { value: 'MITIGATED', labelKey: 'bulkStatus.mitigated' },
    { value: 'ACCEPTED', labelKey: 'bulkStatus.accepted' },
    { value: 'CLOSED', labelKey: 'bulkStatus.closed' },
];

/** RQ2-5 — resolved ALE for a list row (null = not quantified). */
function riskAle(r: RiskListItem): number | null {
    return resolveALE({
        fairAle: r.fairAle ?? null,
        sleAmount: r.sleAmount ?? null,
        aroAmount: r.aroAmount ?? null,
    });
}

interface RiskListItem {
    id: string;
    /** PR-B — RSK-N short identifier. Nullable for historic rows. */
    key?: string | null;
    title: string;
    threat: string;
    likelihood: number;
    impact: number;
    inherentScore: number;
    score?: number;
    category?: string | null;
    treatment: string | null;
    status?: string;
    nextReviewAt?: string | null;
    treatmentOwner?: string | null;
    ownerUserId?: string | null;
    owner?: { id: string; name: string | null; email: string | null } | null;
    asset: { name: string } | null;
    controls: unknown[];
    /** B7 — unified linked-task counts (TaskLink RISK), supplied by listRisks. */
    taskTotal?: number;
    taskDone?: number;
    /** RQ2-5 — quant inputs for the ALE chip + matrix heat overlay. */
    sleAmount?: number | null;
    aroAmount?: number | null;
    fairAle?: number | null;
    /** RQ2-9 — decomposed residual dims for the movement view. */
    residualLikelihood?: number | null;
    residualImpact?: number | null;
    residualScore?: number | null;
}

interface RisksClientProps {
    initialRisks: RiskListItem[];
    initialFilters?: Record<string, string>;
    /**
     * Effective `RiskMatrixConfigShape` for this tenant (Epic 44.1).
     * Drives the heatmap view's `<RiskMatrix>` engine + the score-
     * column chip colour. Resolved server-side; the client never
     * has to handle "no config".
     */
    matrixConfig: RiskMatrixConfigShape;
    tenantSlug: string;
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };
    translations: {
        title: string;
        listDescription: string;
        risksIdentified: string;
        heatmap: string;
        histogram: string;
        register: string;
        addRisk: string;
        riskTitle: string;
        asset: string;
        threat: string;
        score: string;
        level: string;
        treatment: string;
        controlsCol: string;
        noRisks: string;
        low: string;
        medium: string;
        high: string;
        critical: string;
        untreated: string;
        heatmapTitle: string;
        totalRisks: string;
        avgScore: string;
        openRisks: string;
        overdueReviews: string;
    };
}

/**
 * Client island for risks — handles filters, heatmap toggle, and interactive list.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 *
 * Filter architecture (Epic 53):
 *   - `useFilterContext` manages q, status, category, ownerUserId, score.
 *   - The UI carries a single `score=min|max` token; `RISK_API_TRANSFORMS`
 *     splits it into `scoreMin` + `scoreMax` at the API boundary.
 */
// Heatmap-view engine (654 lines, visx-heavy) is lazy-loaded. The default
// view is 'register' (the table), so the matrix only ships its chunk when a
// user toggles to the heatmap view — ssr:false because it's
// interaction-gated, not first-paint. (The NewRiskModal above stays static
// BY DESIGN — see the import note; this is a view-toggle panel, not a
// Playwright-first modal, so it doesn't hit the dev JIT race.)
const RiskMatrix = dynamic(
    () => import('@/components/ui/RiskMatrix').then((m) => m.RiskMatrix),
    { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export function RisksClient(props: RisksClientProps) {
    const filterCtx = useFilterContext([], RISK_FILTER_KEYS, {
        serverFilters: props.initialFilters,
    });
    return (
        <FilterProvider value={filterCtx}>
            <RisksPageInner {...props} />
        </FilterProvider>
    );
}

/**
 * Risk-quantification analytical views (RQ-3…RQ-10) surfaced as icon-only
 * links in the risks header, to the left of the matrix toggle. Each routes to
 * its standalone page; read-only so they show for every role.
 */
const RISK_VIEW_LINKS: ReadonlyArray<{ href: string; labelKey: string; icon: AppIconName }> = [
    { href: '/risks/dashboard', labelKey: 'viewLinks.dashboard', icon: 'activity' },
    // Item 30 — the risk board (RQ3-10) shipped without a nav entry; the
    // page existed but was unreachable from the list header. Restored.
    { href: '/risks/board', labelKey: 'viewLinks.board', icon: 'overview' },
    { href: '/risks/scenarios', labelKey: 'viewLinks.scenarios', icon: 'preview' },
    { href: '/risks/hierarchy', labelKey: 'viewLinks.hierarchy', icon: 'share' },
    { href: '/risks/kri', labelKey: 'viewLinks.kri', icon: 'alertCircle' },
    { href: '/risks/correlations', labelKey: 'viewLinks.correlations', icon: 'mappings' },
    // RQ3-6 — the loss-event register: forecasts meet reality.
    { href: '/risks/loss-events', labelKey: 'viewLinks.lossEvents', icon: 'fileWarning' },
    { href: '/risks/reports', labelKey: 'viewLinks.reports', icon: 'fileSpreadsheet' },
];

function RisksPageInner({
    initialRisks,
    initialFilters,
    matrixConfig,
    tenantSlug,
    permissions,
    translations: t,
}: RisksClientProps) {
    const tx = useTranslations('risks');
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const router = useRouter();
    const prefetchData = usePrefetchTenant();
    // RQ3-4 — per-risk tail percentiles (RQ3-1 cache); failure-soft:
    // without a run the chips render the mean register.
    // RQ3-4/5 — per-risk tail percentiles + appetite cap. Failure-soft via
    // SWR: an error leaves the value null and the chips render the mean
    // register. Cached client-side so revisits are instant (Epic 69).
    const appetiteQuery = useTenantSWR<{ config?: { singleRiskAleMax?: number } }>('/risk-appetite');
    const appetiteCap = appetiteQuery.data?.config?.singleRiskAleMax ?? null;
    const tailQuery = useTenantSWR<{ snapshot?: { byRisk?: Record<string, { aleMean: number; aleP90: number }> } }>(
        '/risks/tail-percentiles',
    );
    const tailByRisk = tailQuery.data?.snapshot?.byRisk ?? null;
    // RQ3-5 — three register views, persisted per tenant (polish #13
    // localStorage pattern) so the histogram preference survives
    // navigation without leaking across tenants.
    const [view, setView] = useLocalStorage<'register' | 'heatmap' | 'histogram'>(
        `inflect:risks-view:${tenantSlug}`,
        'register',
    );

    // Epic 54 — create-risk modal. Also auto-opens on `?create=1`, which
    // the `/risks/new` redirect shim lands on; keeps legacy deep-links
    // and `page.goto('/risks/new')` E2E scripts working against the
    // modal flow. The flag is stripped after open so back/forward
    // doesn't reopen the modal unexpectedly.
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams?.get('create') === '1') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsCreateOpen(true);
            const next = new URLSearchParams(searchParams.toString());
            next.delete('create');
            const qs = next.toString();
            router.replace(
                `/t/${tenantSlug}/risks${qs ? `?${qs}` : ''}`,
                { scroll: false },
            );
        }
        // First-mount only; filter state owns subsequent URL edits.

    }, []);

    const filterCtx = useFilters();
    const { state, search, hasActive } = filterCtx;

    // ─── API query: UI state → API params (range split via transform) ───
    const fetchParams = useMemo(
        () => toApiSearchParams(state, { search, transforms: RISK_API_TRANSFORMS }),
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
        const current = queryKeyFilters;
        const keys = new Set([...Object.keys(current), ...Object.keys(initialFilters!)]);
        for (const k of keys) {
            if ((current[k] ?? '') !== (initialFilters![k] ?? '')) return false;
        }
        return true;
    }, [queryKeyFilters, initialFilters, serverHadFilters, hasActive]);

    // Epic 69 — read source is `useTenantSWR` against a filter-aware
    // cache key. Each unique filter combination becomes its own
    // entry, so toggling filters doesn't fight over the same cache
    // slot. The unfiltered baseline is the registry's `list()`.
    // Server-rendered initial data lands as `fallbackData` only when
    // the active filters match what the server fetched — otherwise
    // the hook fires a fresh request immediately, matching the prior
    // React Query semantics of "skip initialData when filters
    // diverged from the server's view".
    const risksKey = useMemo(() => {
        const qs = fetchParams.toString();
        return qs
            ? `${CACHE_KEYS.risks.list()}?${qs}`
            : CACHE_KEYS.risks.list();
    }, [fetchParams]);

    // PR-5 — API returns `{ rows, truncated }` so the Client knows
    // when the backfill cap fired and can render the truncation
    // banner. SSR initial is wrapped at the page layer with
    // `truncated: false` because the SSR cap (100) is well below the
    // backfill cap (5000) — the banner only fires when SWR brings
    // back the cap+1 sentinel.
    const risksQuery = useTenantSWR<CappedList<RiskListItem>>(risksKey, {
        fallbackData: filtersMatchInitial
            ? { rows: initialRisks, truncated: false }
            : undefined,
    });

    const rawRisks = risksQuery.data?.rows ?? [];
    const truncated = risksQuery.data?.truncated ?? false;
    const loading = risksQuery.isLoading && !risksQuery.data;

    // ─── Bulk actions (canonical BulkActionBar) ───
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkApplying, setBulkApplying] = useState(false);
    const handleBulkApply = async (action: string, value: string) => {
        const ids = Array.from(selected);
        if (!action || ids.length === 0) return;
        setBulkApplying(true);
        try {
            const url = action === 'status'
                ? apiUrl('/risks/bulk/status')
                : action === 'delete'
                    ? apiUrl('/risks/bulk/delete')
                    : apiUrl('/risks/bulk/assign');
            const body =
                action === 'status'
                    ? { riskIds: ids, status: value }
                    : action === 'delete'
                        ? { riskIds: ids }
                        : { riskIds: ids, ownerUserId: value || null };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Bulk action failed');
            await risksQuery.mutate();
            setSelected(new Set());
        } finally {
            setBulkApplying(false);
        }
    };
    const riskBulkActions: BulkActionDef[] = useMemo(
        () => [
            {
                value: 'status',
                label: tx('bulk.setStatus'),
                canApply: (v) => v !== '',
                renderInput: ({ value, setValue }) => {
                    const statusOptions = RISK_STATUS_OPTIONS.map((o) => ({
                        value: o.value,
                        label: tx(o.labelKey),
                    }));
                    return (
                        <Combobox
                            hideSearch
                            id="bulk-value-input"
                            selected={
                                statusOptions.find((o) => o.value === value) ?? null
                            }
                            setSelected={(opt) => setValue(opt?.value ?? '')}
                            options={statusOptions}
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
                        placeholder={tx('bulk.ownerBlank')}
                        className="w-full sm:w-44"
                        id="bulk-value-input"
                    />
                ),
            },
            { value: 'delete', label: tx('bulk.delete'), confirm: true },
        ],
        [tenantSlug, tx],
    );

    // ─── PR-1: org-parity sortable headers ───
    const [sortBy, setSortBy] = useState<string | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
        undefined,
    );
    // Sort accessors return the value each column DISPLAYS, so sorting groups
    // same-displayed-value rows contiguously. The drift-prone columns (asset,
    // ale, treatment, status) point their `accessorFn` at the SAME function
    // below — the sort key and the rendered value can never diverge. (For ALE
    // and the un-treated/OPEN fallbacks this also fixes the old comparator,
    // which sorted by a RAW field while the cell rendered a derived label.)
    const sortAccessors = useMemo<SortAccessors<RiskListItem>>(
        () => ({
            title: (r) => r.title || '',
            asset: (r) => r.asset?.name || '—',
            inherentScore: (r) => r.inherentScore || 0,
            ale: (r) => riskAle(r) ?? null,
            // P1 — canonical treatment vocabulary (Mitigate/Accept/…) so the
            // list reads the same as the detail page + reports.
            treatment: (r) =>
                canonicalTreatmentLabel((k) => tx(k as Parameters<typeof tx>[0]), r.treatment) ?? t.untreated,
            status: (r) => r.status ?? 'OPEN',
        }),
        [t, tx],
    );
    const risks = useMemo(
        () => sortRowsByDisplay(rawRisks, sortAccessors, sortBy, sortOrder),
        [rawRisks, sortAccessors, sortBy, sortOrder],
    );
    const sortableRiskColumns = useMemo(
        () => ['title', 'asset', 'inherentScore', 'ale', 'treatment', 'status'],
        [],
    );

    // ─── Progressive disclosure: load-on-scroll windowing ───
    const {
        visibleRows: visibleRisks,
        hasMore: hasMoreRisks,
        loadMore: loadMoreRisks,
    } = useThresholdLoadMore(risks);

    // ─── Column visibility (Epic 52 / R10-PR6) ───
    // Pagination removed in favour of internal scroll inside the
    // table card (see ListPageShell.Body + DataTable fillBody).
    // All filtered rows render at once; the card scrolls.
    const riskColumns = useMemo(
        () => [
            // Code is off by default (toggle on via the gear). The column def
            // still leads (table-unification first-column rule); only its
            // default visibility is off.
            { id: 'code', label: tx('colVis.code'), defaultVisible: false },
            { id: 'title', label: tx('colVis.title') },
            { id: 'asset', label: tx('colVis.asset') },
            { id: 'inherentScore', label: tx('colVis.score') },
            { id: 'level', label: tx('colVis.level') },
            { id: 'status', label: tx('colVis.status') },
            { id: 'owner', label: tx('colVis.owner') },
            { id: 'treatment', label: tx('colVis.treatment') },
            // ALE (annualised loss expectancy) is off by default — it widens
            // the row and caused the default table to scroll horizontally.
            // Still toggleable on via the gear.
            { id: 'ale', label: tx('colVis.ale'), defaultVisible: false },
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
        storageKey: 'inflect:col-vis:risks',
        columns: riskColumns,
    });

    // ── KPI Computations ──
    // Local aggregations over the already-fetched page of risks — these
    // power the KPI cards and the 5×5 heatmap, not a re-filter of the
    // server-side data set. The `// guardrail-ignore` directives tell
    // `tests/guardrails/no-client-side-filtering.test.ts` to skip them.
    const total = risks.length;
    const avgScore = total ? (risks.reduce((s, r) => s + r.inherentScore, 0) / total).toFixed(1) : '0.0';
    // guardrail-ignore: KPI count across the loaded page, not a refilter.
    const openCount = risks.filter(r => r.status === 'OPEN' || r.status === 'MITIGATING').length;
    // `now` is null during SSR and first client render so the overdue
    // count matches exactly across hydration (avoids React #418/#422).
    const now = useHydratedNow();
    // guardrail-ignore: KPI count across the loaded page, not a refilter.
    const overdueRisks = now ? risks.filter(r => r.nextReviewAt && new Date(r.nextReviewAt) < now) : [];

    // Canonical KPI-card sparklines (shared hook). total + open are always-
    // present series; avgScore + overdue are forward-only nullable columns
    // (PR3) — empty until history accrues, never a fake ramp.
    const trendsQuery = useKpiTrends(tenantSlug);
    const riskTrends = useMemo(() => {
        const points = trendsQuery.data?.dataPoints;
        const base = buildKpiSparklines(points, (d) => d.risksTotal, {
            total: (d) => d.risksTotal,
            open: (d) => d.risksOpen,
        });
        return {
            ...base,
            avgScore: buildKpiSparklineNullable(points, (d) => d.risksAvgScore),
            overdue: buildKpiSparklineNullable(points, (d) => d.risksOverdueReview),
        };
    }, [trendsQuery.data]);
    // Distinct sparkline colour per card (canonical allocator).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const sparkColors = useMemo(
        () => assignSparklineVariants(['total', 'avgScore', 'open', 'overdue']),
        [],
    );

    // R23-PR-B — Typed KPI definitions consumed by useKpiFilter. The
    // hook derives the active card from current filter state, so the
    // "Open" KPI lights up automatically whenever status=OPEN is
    // applied (KPI click OR a status pill set via the dropdown). The
    // "Total" KPI is active when no filters are set — it's the
    // implicit default state.
    type RiskKpiId = 'total' | 'open';
    const kpiDefs: ReadonlyArray<KpiFilterDef<RiskKpiId>> = useMemo(
        () => [
            {
                // "Total" — its target state IS "no filters"; clearing
                // is the deactivation. The optional `clear` is omitted
                // so the hook falls back to ctx.clearAll().
                id: 'total',
                apply: (ctx) => ctx.clearAll(),
                isActive: (state) => Object.keys(state).length === 0,
            },
            {
                // "Open" — owns the `status` key only. PR-C `clear`
                // scopes teardown so toggling off doesn't disturb a
                // search query or sibling category/severity filter
                // the user may have layered on.
                id: 'open',
                apply: (ctx) => ctx.set('status', 'OPEN'),
                isActive: (state) =>
                    (state.status ?? []).includes('OPEN'),
                clear: (ctx) => ctx.removeAll('status'),
            },
        ],
        [],
    );
    const { activeKpiId, toggle: toggleKpi } = useKpiFilter(kpiDefs);

    // R-filter-gear (#3, 2026-06-07) — the gear controls the quantifiable
    // KPI cards (Total / Avg score / Open / Overdue), not filter categories.
    // The hook lives in the PARENT (where the KPI grid is); the gear is
    // threaded DOWN to RisksFilterToolbar's actions slot.
    const kpiCards: CardDefinition[] = useMemo(
        () => [
            { id: 'total', label: t.totalRisks, kind: 'kpi' },
            { id: 'avgScore', label: t.avgScore, kind: 'kpi' },
            { id: 'open', label: t.openRisks, kind: 'kpi' },
            { id: 'overdue', label: t.overdueReviews, kind: 'kpi' },
        ],
        [t],
    );
    const { visibleCards: visibleKpiCards, dropdown: filtersDropdown } =
        useFilterCardVisibility({
            storageKey: 'inflect:filter-vis:risks',
            cards: kpiCards,
        });

    // RQ3-5 — cell collisions (pure detector): same-matrix-cell risks
    // whose ALEs differ >10×. Flagged on the heatmap AND the histogram.
    const collisions = useMemo(
        () =>
            detectCellCollisions(
                risks.map((r) => ({
                    id: r.id,
                    title: r.title,
                    likelihood: r.likelihood,
                    impact: r.impact,
                    ale: riskAle(r),
                })),
            ),
        [risks],
    );

    // RQ3-5 — histogram data: each quantified risk with its tenant
    // band (the histogram stacks by the same colours the heatmap paints).
    const histogramData = useMemo<AleHistogramDatum[]>(() => {
        const out: AleHistogramDatum[] = [];
        for (const r of risks) {
            const ale = riskAle(r);
            if (ale == null || ale <= 0) continue;
            const band = resolveBandForScore(r.inherentScore, matrixConfig.bands);
            out.push({ id: r.id, title: r.title, ale, bandName: band.name, bandColor: band.color });
        }
        return out;
    }, [risks, matrixConfig]);

    // Epic 44.3 — collapse the loaded page into the sparse `(L, I)`
    // shape the new `<RiskMatrix>` engine consumes. Each cell carries
    // count + risk titles for the bubble overlay; the engine handles
    // truncation + tooltip so the page stays presentation-free.
    const matrixCells = useMemo(() => {
        const lookup = new Map<
            string,
            { likelihood: number; impact: number; count: number; totalAle: number; risks: { id: string; title: string }[] }
        >();
        for (const r of risks) {
            const key = `${r.likelihood}-${r.impact}`;
            // guardrail-ignore: bucketing the loaded page into the matrix cells.
            const cell = lookup.get(key) ?? {
                likelihood: r.likelihood,
                impact: r.impact,
                count: 0,
                // RQ2-5 — summed ALE powers the heat overlay toggle.
                totalAle: 0,
                risks: [],
            };
            cell.count += 1;
            cell.totalAle += riskAle(r) ?? 0;
            cell.risks.push({ id: r.id, title: r.title });
            lookup.set(key, cell);
        }
        // RQ3-5 — flag range-compression: same-cell ALEs differing
        // >10× get the collision marker on the heatmap.
        const cells = Array.from(lookup.values());
        for (const c of collisions) {
            const hit = cells.find((x) => x.likelihood === c.likelihood && x.impact === c.impact);
            if (hit) (hit as { collisionRatio?: number }).collisionRatio = c.ratio;
        }
        return cells;
         
    }, [risks, collisions]);

    // RQ2-9 — inherent → residual movements for the matrix overlay.
    // Only decomposed residuals (RQ2-1 dims) qualify: a legacy
    // undecomposed score has no destination cell, and inventing one
    // would draw a lie.
    const matrixMovements = useMemo(
        () =>
            risks
                .filter(
                    (r) =>
                        r.residualLikelihood != null && r.residualImpact != null,
                )
                .map((r) => ({
                    riskId: r.id,
                    title: r.title,
                    from: { likelihood: r.likelihood, impact: r.impact },
                    to: { likelihood: r.residualLikelihood as number, impact: r.residualImpact as number },
                })),
        [risks],
    );

    // RQ2-10 — the Level column reads the TENANT'S OWN bands (the
    // same resolveBandForScore the score chip, matrix, and explainer
    // use) instead of a second hardcoded threshold set that drifted
    // from the configured matrix.
    const getRiskBand = useCallback(
        (score: number) => resolveBandForScore(score, matrixConfig.bands),
        [matrixConfig.bands],
    );

    // Workflow-status variants (Epic 44.4). The label set mirrors
    // `RiskStatus` in the schema. Audit S1 (2026-05-24) added
    // `MITIGATED` — controls implemented, residual accepted (distinct
    // from CLOSED which means risk eliminated).
    const STATUS_CLASS: Record<string, StatusBadgeVariant> = {
        OPEN: 'warning',
        MITIGATING: 'info',
        MITIGATED: 'success',
        ACCEPTED: 'neutral',
        CLOSED: 'success',
    };

    // ── Column Definitions ──
    const riskTableColumns = useMemo(() => createColumns<RiskListItem>([
        {
            // PR-B — Code column (RSK-N). The Risk list now opens
            // with the scannable per-tenant key, matching the
            // Controls/Tasks convention. Historic rows render an
            // em-dash; new rows mint a key in the create-path.
            id: 'code',
            header: tx('colHeaders.code'),
            accessorFn: (r) => r.key || '',
            cell: ({ row }) =>
                row.original.key ? (
                    <span className="font-mono text-xs text-content-muted tabular-nums">
                        {row.original.key}
                    </span>
                ) : (
                    <span className="text-content-subtle">—</span>
                ),
        },
        {
            accessorKey: 'title',
            header: t.riskTitle,
            cell: ({ row, getValue }) => (
                // B2 — match the Controls table standard: the title
                // cell is a `<Link>` so single-click on the title
                // navigates while double-click on the row (handled
                // by DataTable) does the same. Pre-B2 the risks
                // table rendered the title as plain text, leaving
                // navigation only on double-click — inconsistent
                // with the canonical Controls behaviour.
                <TableTitleCell
                    href={tenantHref(`/risks/${row.original.id}`)}
                    id={`risk-link-${row.original.id}`}
                >
                    {getValue<string>()}
                </TableTitleCell>
            ),
        },
        {
            accessorFn: sortAccessors.asset,
            id: 'asset',
            header: t.asset,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            accessorKey: 'inherentScore',
            header: t.score,
            // Epic 44.4 — score chip uses the band colour from the
            // tenant's RiskMatrixConfig, so the colour, threshold,
            // and label set all stay configurable. Falls back to a
            // neutral chip if a band can't be resolved (mid-edit
            // config preview).
            cell: ({ getValue, row }) => {
                const score = getValue<number>();
                const band = resolveBandForScore(score, matrixConfig.bands);
                // axe AA — `color-contrast`: the previous chip used
                // `band.color` for both the tinted background AND the
                // text, so the contrast ratio collapsed to ~2:1 (well
                // below WCAG AA's 4.5:1 for small text). Splitting the
                // visual roles fixes it without losing the band cue:
                //   - background: tinted `band.color` (kept as the
                //     band-recognition cue),
                //   - dot: solid `band.color` (a second, higher-
                //     saturation cue that reads even when the tint is
                //     subtle),
                //   - text: `text-content-emphasis` (the app's
                //     designed-for-contrast neutral, ~16:1 against
                //     either palette).
                return (
                    // RQ2-3 — every score chip explains itself; the
                    // popover lazy-fetches on open (no per-row cost).
                    <span className="inline-flex items-center gap-tight">
                        <RiskScoreExplainer tenantSlug={tenantSlug} riskId={row.original.id} label={`${score} · ${band.name}`}>
                            <span
                                className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 font-bold tabular-nums text-content-emphasis"
                                style={{
                                    backgroundColor: `${band.color}33`, // 20% alpha
                                }}
                                title={`${band.name} (${score})`}
                                data-band={band.name}
                                data-testid={`risk-score-${row.original.id}`}
                            >
                                <span
                                    aria-hidden="true"
                                    className="inline-block w-1.5 h-1.5 rounded-full"
                                    style={{ backgroundColor: band.color }}
                                />
                                {score}
                            </span>
                        </RiskScoreExplainer>
                        {/* RQ2-5 / RQ3-4 — qual ↔ quant side by
                            side: quantified rows carry the compact
                            tail register beside the score chip
                            ("€120K · bad yr €1.4M" when the RQ3-1
                            cache has tails; the bare mean otherwise). */}
                        {(() => {
                            const ale = riskAle(row.original);
                            const label = formatTailAwareAle(
                                ale,
                                tailByRisk?.[row.original.id]?.aleP90 ?? null,
                                { money: formatCompactCurrency, compact: true },
                            );
                            return label !== null ? (
                                <span
                                    className="text-[10px] tabular-nums text-content-muted"
                                    title={tx('aleTitle')}
                                    data-testid={`risk-ale-${row.original.id}`}
                                >
                                    {label}
                                </span>
                            ) : null;
                        })()}
                    </span>
                );
            },
        },
        {
            id: 'level',
            header: t.level,
            accessorFn: (r) => r.inherentScore,
            cell: ({ getValue }) => {
                const band = getRiskBand(getValue<number>());
                // polish #9 — denser dot+name renders faster than the
                // old StatusBadge; the Epic 56 Tooltip carries the
                // score range so the band → range mapping reads on
                // hover/focus without leaving the row.
                return (
                    <Tooltip content={`${band.name} · score ${band.minScore}–${band.maxScore}`}>
                        <span
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-content-default cursor-help"
                            data-band={band.name}
                        >
                            <span
                                aria-hidden="true"
                                className="inline-block w-1.5 h-1.5 rounded-full"
                                style={{ backgroundColor: band.color }}
                            />
                            {band.name}
                        </span>
                    </Tooltip>
                );
            },
        },
        {
            // RQ3-OB-B — dedicated ALE column. The inline chip next
            // to the score (above) keeps the qual↔quant side-by-side
            // (RQ2-5 / RQ3-4); THIS column adds sortability — a
            // 200-row register pivots to "the ones the money points
            // at" via the column header.
            id: 'ale',
            header: tx('colHeaders.ale'),
            accessorFn: sortAccessors.ale,
            cell: ({ getValue }) => {
                const ale = getValue<number | null>();
                return ale !== null ? (
                    <span className="text-xs tabular-nums text-content-muted">
                        {formatCompactCurrency(ale)}
                    </span>
                ) : (
                    <span className="text-xs text-content-subtle">—</span>
                );
            },
        },
        {
            id: 'status',
            header: tx('colHeaders.status'),
            accessorFn: sortAccessors.status,
            cell: ({ row }) => {
                const status = row.original.status ?? 'OPEN';
                return (
                    <StatusBadge variant={STATUS_CLASS[status] ?? 'neutral'} size="sm" data-testid={`risk-status-${row.original.id}`}>
                        {status}
                    </StatusBadge>
                );
            },
        },
        {
            id: 'owner',
            header: tx('colHeaders.owner'),
            // Owner display: name (or email local-part as a username) →
            // legacy free-text `treatmentOwner` → em-dash. The full email is
            // intentionally NOT shown; it stays on the row for the owner filter.
            accessorFn: (r) =>
                ownerDisplayName(r.owner?.name, r.owner?.email) ??
                r.treatmentOwner ??
                '—',
            cell: ({ row }) => {
                const r = row.original;
                const display =
                    ownerDisplayName(r.owner?.name, r.owner?.email) ?? r.treatmentOwner ?? null;
                return (
                    <span
                        className="text-xs text-content-muted"
                        data-testid={`risk-owner-${r.id}`}
                    >
                        {display ?? <span className="text-content-subtle">—</span>}
                    </span>
                );
            },
        },
        {
            id: 'treatment',
            header: t.treatment,
            accessorFn: sortAccessors.treatment,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<string>()}</span>
            ),
        },
        {
            id: 'controls',
            header: t.controlsCol,
            accessorFn: (r) => r.controls?.length || 0,
            cell: ({ getValue }) => (
                <span className="text-xs">{getValue<number>()}</span>
            ),
        },
        {
            // B7 — unified linked-task count (done/total), matching Controls.
            id: 'tasks',
            header: tx('colHeaders.tasks'),
            accessorFn: (r) => `${r.taskDone ?? 0}/${r.taskTotal ?? 0}`,
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
    ]), [t, tx, getRiskBand, matrixConfig, tailByRisk, sortAccessors]);

    // Right-rail Phase 3 — the AI assist co-pilot rail. A persistent,
    // co-resident entry point to the AI risk-assessment flow that
    // follows the user across the register. Gated on write permission
    // (the AI flow itself requires `risks.create`); `defaultCollapsed`
    // so it lands as a quiet 44px spine, not a 320px land-grab — the
    // user expands it when they want to engage.
    const aiAssistRail = permissions.canWrite ? (
        <AsidePanel
            title={tx('aiAssist')}
            surfaceKey="risks-list"
            defaultCollapsed
            icon={<Sparkle3 className="h-4 w-4" />}
        >
            <AiAssistRail aiHref={tenantHref('/risks/ai')} />
        </AsidePanel>
    ) : undefined;

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
                    {/* Item 4/5 — the create button moved to the toolbar's
                        leading slot and the nav icons/toggles moved into the
                        toolbar's actions slot, so the header action cluster is
                        empty and the wrapping div is gone. */}
                </div>
            </ListPageShell.Header>

            <ListPageShell.Filters className="space-y-section">
                {/* KPI Cards — R23-PR-A: KpiFilterCard primitive. The
                    Risks page is the first consumer of the shared
                    primitive; later R23 PRs roll it out to Assets,
                    Controls, Tasks, Evidence, Policies, Vendors. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                    {visibleKpiCards.map((card) => {
                        const cfg: Record<
                            string,
                            {
                                value: React.ReactNode;
                                tone?:
                                    | 'success'
                                    | 'attention'
                                    | 'critical'
                                    | 'default';
                                kpi?: RiskKpiId;
                                sparkline?: typeof riskTrends.total;
                            }
                        > = {
                            total: { value: total, kpi: 'total', sparkline: riskTrends.total },
                            avgScore: {
                                value: avgScore,
                                tone: 'attention',
                                sparkline: riskTrends.avgScore,
                            },
                            open: {
                                value: openCount,
                                tone: 'success',
                                kpi: 'open',
                                sparkline: riskTrends.open,
                            },
                            overdue: {
                                value: overdueRisks.length,
                                tone:
                                    overdueRisks.length > 0
                                        ? 'critical'
                                        : 'success',
                                sparkline: riskTrends.overdue,
                            },
                        };
                        const c = cfg[card.id];
                        if (!c) return null;
                        const kpiId = c.kpi;
                        return (
                            <KpiFilterCard
                                key={card.id}
                                label={card.label}
                                value={c.value}
                                tone={c.tone}
                                sparkline={c.sparkline}
                                sparklineVariant={sparkColors[card.id as keyof typeof sparkColors]}
                                sparklineDomain={centeredSparklineDomain(c.sparkline)}
                                onClick={
                                    kpiId ? () => toggleKpi(kpiId) : undefined
                                }
                                selected={
                                    kpiId ? activeKpiId === kpiId : undefined
                                }
                            />
                        );
                    })}
                </div>

                <RisksFilterToolbar
                    risks={risks}
                    columnsDropdown={columnsDropdown}
                    filtersDropdown={filtersDropdown}
                    leading={
                        permissions.canWrite ? (
                            <Button
                                variant="primary"
                                icon={<Plus className="-ml-0.5 -mr-2.5" />}
                                onClick={() => setIsCreateOpen(true)}
                                id="new-risk-btn"
                            >
                                {t.addRisk}
                            </Button>
                        ) : undefined
                    }
                    navActions={
                        <>
                            {/* Item 30 — Register and Matrix collapse to a
                                single two-state toggle (table ⇄ heatmap of the
                                same register). It leads the row — the view
                                layout is the primary control; the icon buttons
                                that follow are secondary navigation. The
                                histogram is no longer a third peer in this
                                toggle — it is its own standalone icon button,
                                so the distribution view reads as a distinct
                                analytical mode rather than a register layout.
                                The choice persists (polish #13 pattern). */}
                            <ToggleGroup
                                size="sm"
                                ariaLabel={tx('viewAria')}
                                options={[
                                    { value: 'register', label: t.register, id: 'risks-view-register' },
                                    { value: 'heatmap', label: t.heatmap, id: 'risks-view-heatmap' },
                                ]}
                                selected={view === 'histogram' ? null : view}
                                selectAction={(v) => setView(v as 'register' | 'heatmap')}
                            />
                            <Tooltip content={t.histogram}>
                                <Button
                                    variant={view === 'histogram' ? 'primary' : 'secondary'}
                                    size="icon"
                                    id="risks-view-histogram"
                                    aria-label={t.histogram}
                                    aria-pressed={view === 'histogram'}
                                    onClick={() => setView('histogram')}
                                >
                                    <AppIcon name="dashboard" size={16} />
                                </Button>
                            </Tooltip>
                            {/* Vulnerabilities is a subpage of the Risk
                                Register — reached via this icon button (the
                                sidebar entry was retired). */}
                            <Tooltip content={tx('vulnerabilities')}>
                                <Link
                                    href={tenantHref('/vulnerabilities')}
                                    aria-label={tx('vulnerabilities')}
                                    className={buttonVariants({ variant: 'secondary', size: 'icon' })}
                                    id="risks-vulnerabilities-btn"
                                >
                                    <AppIcon name="shield" size={16} />
                                </Link>
                            </Tooltip>
                            {RISK_VIEW_LINKS.map((v) => {
                                const label = tx(v.labelKey);
                                return (
                                    <Tooltip key={v.href} content={label}>
                                        <Link
                                            href={tenantHref(v.href)}
                                            aria-label={label}
                                            className={buttonVariants({ variant: 'secondary', size: 'icon' })}
                                        >
                                            <AppIcon name={v.icon} size={16} />
                                        </Link>
                                    </Tooltip>
                                );
                            })}
                            {permissions.canWrite && (
                                <Tooltip content={tx('importRisks')}>
                                    <Link href={tenantHref('/risks/import')} aria-label={tx('importRisks')} className={buttonVariants({ variant: 'secondary', size: 'icon' })} id="risk-import-btn">
                                        <AppIcon name="upload" size={16} />
                                    </Link>
                                </Tooltip>
                            )}
                        </>
                    }
                />
            </ListPageShell.Filters>

            <ListPageShell.Body aside={aiAssistRail}>
                <TruncationBanner truncated={truncated} />
                {view === 'histogram' ? (
                    <div className="space-y-default" data-testid="risk-histogram-view">
                        <div>
                            <Heading level={3} className="mb-1">{tx('histogramView.title')}</Heading>
                            <p className="mb-tight text-xs text-content-subtle">
                                {tx('histogramView.description')}
                            </p>
                            <AleHistogram
                                data={histogramData}
                                referenceLine={
                                    appetiteCap != null
                                        ? { value: appetiteCap, label: tx('histogramView.perRiskAppetite') }
                                        : null
                                }
                                testId="risk-ale-histogram"
                            />
                            {histogramData.length === 0 && (
                                <p className="text-sm text-content-muted">
                                    {tx('histogramView.empty')}
                                </p>
                            )}
                        </div>
                        {/* RQ3-5 — range-compression callouts: the
                            same collisions the heatmap flags, spelled
                            out. Click drills into the cell's risks. */}
                        {collisions.length > 0 && (
                            <div data-testid="risk-collision-callouts">
                                <Heading level={3} className="mb-1">{tx('collisions.title')}</Heading>
                                <p className="mb-tight text-xs text-content-subtle">
                                    {tx('collisions.description')}
                                </p>
                                <div className="space-y-tight">
                                    {collisions.map((c) => (
                                        <button
                                            key={`${c.likelihood}-${c.impact}`}
                                            type="button"
                                            className="flex w-full items-center justify-between gap-default rounded p-2 text-left text-sm hover:bg-bg-muted/50 transition-colors duration-100 ease-out"
                                            data-testid={`risk-collision-${c.likelihood}-${c.impact}`}
                                            onClick={() => {
                                                const score = c.likelihood * c.impact;
                                                filterCtx.set('score', `${score}|${score}`);
                                                setView('register');
                                            }}
                                        >
                                            <span className="truncate text-content-emphasis">
                                                L{c.likelihood}×I{c.impact}: {c.minRisk.title} vs {c.maxRisk.title}
                                            </span>
                                            <span className="shrink-0 tabular-nums text-content-muted">
                                                {formatCompactCurrency(c.minRisk.ale)} vs {formatCompactCurrency(c.maxRisk.ale)} (~{Math.round(c.ratio)}×)
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ) : view === 'heatmap' ? (
                    <RiskMatrix
                        config={matrixConfig}
                        cells={matrixCells}
                        movements={matrixMovements}
                        // polish #13 — per-tenant storage so a
                        // multi-tenant operator's mode preference
                        // doesn't leak across tenants.
                        storageKey={`inflect:risk-matrix:${tenantSlug}`}
                        title={t.heatmapTitle}
                        mode="bubble"
                        onCellClick={(cell) => {
                            // Drill into the risks that share this
                            // (likelihood, impact) cell by setting the
                            // score range filter on the cell's score —
                            // single-score range collapses to the
                            // matching cell.
                            const score = cell.likelihood * cell.impact;
                            filterCtx.set('score', `${score}|${score}`);
                            setView('register');
                        }}
                    />
                ) : (
                    <DataTable<RiskListItem>
                        fillBody
                        onReachEnd={hasMoreRisks ? loadMoreRisks : undefined}
                        data={visibleRisks}
                        columns={orderColumns(riskTableColumns)}
                        loading={loading}
                        getRowId={(r) => r.id}
                        sortableColumns={sortableRiskColumns}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSortChange={({
                            sortBy: nextBy,
                            sortOrder: nextOrder,
                        }) => {
                            setSortBy(nextBy);
                            setSortOrder(nextOrder);
                        }}
                        onRowClick={(row) => router.push(tenantHref(`/risks/${row.original.id}`))}
                        onRowPrefetch={(row) => { router.prefetch(tenantHref(`/risks/${row.original.id}`)); prefetchData(`/risks/${row.original.id}`); }}
                        selectionEnabled
                        selectedRows={Object.fromEntries(
                            Array.from(selected).map((id) => [id, true]),
                        )}
                        onRowSelectionChange={(rows) =>
                            setSelected(new Set(rows.map((r) => r.original.id)))
                        }
                        selectionControls={() => (
                            <BulkActionBar
                                actions={riskBulkActions}
                                onApply={handleBulkApply}
                                applying={bulkApplying}
                                selectedCount={selected.size}
                                entityLabel={tx('entityRisks')}
                            />
                        )}
                        emptyState={
                            hasActive ? (
                                <EmptyState
                                    size="sm"
                                    variant="no-results"
                                    title={tx('emptyFilter.title')}
                                    description={tx('emptyFilter.description')}
                                    secondaryAction={{
                                        label: tx('emptyFilter.clearFilters'),
                                        onClick: () => filterCtx.clearAll(),
                                    }}
                                />
                            ) : (
                                <RiskFirstRunEmpty
                                    size="sm"
                                    onCreateClick={() => setIsCreateOpen(true)}
                                />
                            )
                        }
                        resourceName={(p) => p ? tx('entityRisks') : tx('entityRisk')}
                        columnVisibility={columnVisibility}
                        onColumnVisibilityChange={setColumnVisibility}
                        data-testid="risks-table"
                        className="hover:bg-bg-muted"
                    />
                )}
            </ListPageShell.Body>

            {permissions.canWrite && (
                <NewRiskModal
                    open={isCreateOpen}
                    setOpen={setIsCreateOpen}
                    tenantSlug={tenantSlug}
                    apiUrl={apiUrl}
                />
            )}
        </ListPageShell>
    );
}

// ─── Risks filter toolbar ────────────────────────────────────────────

function RisksFilterToolbar({
    risks,
    columnsDropdown,
    filtersDropdown,
    leading,
    navActions,
}: {
    risks: RiskListItem[];
    columnsDropdown?: React.ReactNode;
    filtersDropdown?: React.ReactNode;
    // Item 4 — primary create button rendered in the toolbar's leading slot.
    leading?: React.ReactNode;
    // Item 5 — page nav icon links/toggles, rendered to the LEFT of the gears.
    navActions?: React.ReactNode;
}) {
    // R-filter-gear (#3): the KPI-card gear is built in the PARENT (it
    // controls the parent's KPI grid) and threaded in here; this toolbar
    // shows the FULL filter defs.
    const tx = useTranslations('risks');
    const tGroup = useTranslations('common.filterGroups');
    // next-intl's scoped Translator types the key as a narrow union; the
    // filter-defs factory takes a plain (key: string) resolver. Adapt with a
    // thin arrow — the runtime accepts any dotted key in the namespace.
    const filters: FilterType[] = useMemo(
        () =>
            buildRiskFilters(
                risks,
                (k, v) => tx(k as Parameters<typeof tx>[0], v as Parameters<typeof tx>[1]),
                (k) => tGroup(k as Parameters<typeof tGroup>[0]),
            ),
        [risks, tx, tGroup],
    );
    return (
        <FilterToolbar
            filters={filters}
            searchId="risks-search"
            searchPlaceholder={tx('searchPlaceholder')}
            leading={leading}
            actions={<>{navActions}{columnsDropdown}{filtersDropdown}</>}
        />
    );
}
