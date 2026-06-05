'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

/* eslint-disable react-hooks/exhaustive-deps -- Various useMemo dep arrays in this file deliberately omit identity-unstable callbacks (handlers/derived arrays recreated each render). The proper structural fix is wrapping parent-level callbacks in useCallback. Tracked as follow-up; existing per-line eslint-disable-next-line markers preserved. */
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Row, RowSelectionState } from '@tanstack/react-table';
import { useRouter, useSearchParams } from 'next/navigation';
// NewControlModal and ControlDetailSheet were previously lazy-loaded
// via next/dynamic, but the JIT race in `next dev` made the modals
// occasionally fail to mount in serial-mode E2E runs (Playwright
// clicked the trigger before the chunk finished compiling). Static
// imports — the bundle cost is negligible and the E2E suite becomes
// deterministic.
import { NewControlModal } from './NewControlModal';
import { ControlDetailSheet } from './ControlDetailSheet';
import { queryKeys } from '@/lib/queryKeys';
import { AppIcon } from '@/components/icons/AppIcon';
import { Plus } from '@/components/ui/icons/nucleo';
import { Paperclip, CheckCircle2, AlertTriangle, X } from 'lucide-react';
import {
    createColumns,
    useColumnsDropdown,
} from '@/components/ui/table';
import { Button, buttonVariants } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import {
    FilterProvider,
    filterStateToUrlParams,
    useFilterContext,
    useFilters,
    type FilterType,
} from '@/components/ui/filter';
import { EntityListPage } from '@/components/layout/EntityListPage';
import { TableLoadMoreFooter } from '@/components/ui/table-load-more-footer';
import { useThresholdLoadMore } from '@/components/ui/hooks';
import { AsidePanel } from '@/components/ui/aside-panel';
import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from '@/components/ui/accordion';
import {
    categorizeControl,
    ISO27001_DOMAIN_ORDER,
} from '@/lib/controls/control-taxonomy';
import { AiAssistRail } from '@/components/ui/ai-assist-rail';
import { Sparkle3 } from '@/components/ui/icons/nucleo/sparkle3';
import { SelectionSummaryPanel } from '@/components/ui/selection-summary-panel';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { useKpiFilter, type KpiFilterDef } from '@/components/ui/kpi-filter';
import type { CappedList } from '@/lib/list-backfill-cap';
import { TruncationBanner } from '@/components/ui/TruncationBanner';
import {
    buildControlFilters,
    CONTROL_FILTER_KEYS,
    CONTROL_STATUS_LABELS,
} from './filter-defs';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';

// ─── Constants ───

const STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    NOT_STARTED: 'neutral',
    PLANNED: 'neutral',
    IN_PROGRESS: 'info',
    IMPLEMENTING: 'info',
    IMPLEMENTED: 'success',
    NEEDS_REVIEW: 'warning',
    NOT_APPLICABLE: 'neutral',
};
/**
 * Status labels are sourced from the shared filter-defs module so the badge
 * copy and the filter picker copy cannot drift. Keep the typed
 * `CONTROL_STATUS_LABELS` as the single source of truth.
 */
const STATUS_LABELS: Record<string, string> = CONTROL_STATUS_LABELS;
const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};

// ─── Types ───

interface ControlListItem {
    id: string;
    code: string | null;
    annexId: string | null;
    name: string;
    description: string | null;
    status: string;
    applicability: string;
    category: string | null;
    frequency: string | null;
    /** Widened to include id/email so the owner filter can resolve + display. */
    owner: { id: string; name: string | null; email: string | null } | null;
    _count?: { controlTasks?: number; evidenceLinks?: number };
    controlTasks?: Array<{ status: string }>;
    /**
     * Unified linked-task counts (TaskLink CONTROL link OR the
     * `controlId` FK), supplied by `listControls`. The Tasks column
     * reads these — the legacy `_count.controlTasks` / `controlTasks[]`
     * counted the old ControlTask relation and read 0/0 for unified
     * tasks.
     */
    taskTotal?: number;
    taskDone?: number;
}

interface ControlsClientProps {
    initialControls: ControlListItem[];
    initialFilters?: Record<string, string>;
    tenantSlug: string;
    permissions: {
        canRead: boolean;
        canWrite: boolean;
        canAdmin: boolean;
        canAudit: boolean;
        canExport: boolean;
    };
    appPermissions: {
        controls: { create: boolean; edit: boolean };
    };
}

/**
 * Client island for controls — handles filters, status cycling, applicability mutations.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 *
 * Filter architecture (Epic 53):
 *   - `useFilterContext` manages state + URL sync for everything except search.
 *   - `search` is the `q` param, owned by the same context.
 *   - Owner / Category options are derived client-side from loaded controls so
 *     the picker reflects reality without an extra API call.
 */
export function ControlsClient(props: ControlsClientProps) {
    // Build the filter context at the outer boundary so the provider can wrap
    // the inner tree — the inner component consumes via `useFilters()`.
    const filterCtx = useFilterContext(
        // Static filter defs — options are patched in inside the inner component
        // where `controls` are available. Outer uses the static shape for keys.
        [],
        CONTROL_FILTER_KEYS,
        { serverFilters: props.initialFilters },
    );

    return (
        <FilterProvider value={filterCtx}>
            <ControlsPageInner {...props} />
        </FilterProvider>
    );
}

function ControlsPageInner({
    initialControls,
    initialFilters,
    tenantSlug,
    appPermissions,
}: ControlsClientProps) {
    // Stable across renders — selection-toggle re-renders (Phase 2)
    // must NOT hand the DataTable fresh `columns` / `onRowClick` /
    // `getRowId` references, or it rebuilds the whole table model
    // mid-double-click and breaks double-click-to-navigate.
    const apiUrl = useCallback(
        (path: string) => `/api/t/${tenantSlug}${path}`,
        [tenantSlug],
    );
    const tenantHref = useCallback(
        (path: string) => `/t/${tenantSlug}${path}`,
        [tenantSlug],
    );
    const queryClient = useQueryClient();
    const router = useRouter();

    const filterCtx = useFilters();
    const { state, search, clearAll, hasActive } = filterCtx;

    // Justification modal state

    // Detail / edit Sheet state — selected control id or null for closed.
    const [sheetControlId, setSheetControlId] = useState<string | null>(null);

    // Create-control modal state. Auto-opens when the page is reached via
    // `/controls?create=1` — the `/controls/new` page redirects here so
    // deep links and E2E tests that `page.goto('/controls/new')` keep
    // working against the modal-based flow.
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams?.get('create') === '1') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsCreateOpen(true);
            // Strip the flag so browser back/forward doesn't re-open the
            // modal unexpectedly and so the URL stays clean after open.
            const next = new URLSearchParams(searchParams.toString());
            next.delete('create');
            const qs = next.toString();
            router.replace(`/t/${tenantSlug}/controls${qs ? `?${qs}` : ''}`, { scroll: false });
        }
        // Only run on first mount of the inner component; subsequent URL
        // edits are driven by filter state (which does its own sync).

    }, []);

    // ─── API query string from filter state + search ───
    const filtersForQuery = useMemo(() => {
        const params = filterStateToUrlParams(state);
        if (search) params.set('q', search);
        return params;
    }, [state, search]);

    // Flat shape for react-query cache key stability (objects with the same
    // serialised content should hit the same cache entry).
    const queryKeyFilters = useMemo(() => {
        const obj: Record<string, string> = {};
        for (const [k, v] of filtersForQuery) obj[k] = v;
        return obj;
    }, [filtersForQuery]);

    // ─── Query: controls list (hydrated with server data) ───

    // When server provides initialFilters, the data is already filtered server-side.
    // Only use initialData when the live filter state still matches what the server saw.
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

    // PR-5 — API returns `{ rows, truncated }`; SSR initial wraps
    // with `truncated: false` because the SSR cap (100) is well below
    // the backfill cap (5000), so the SSR slice never trips truncation
    // by itself.
    const controlsQuery = useQuery<CappedList<ControlListItem>>({
        queryKey: queryKeys.controls.list(tenantSlug, queryKeyFilters),
        queryFn: async () => {
            const qs = filtersForQuery.toString();
            const res = await fetch(apiUrl(`/controls${qs ? `?${qs}` : ''}`));
            if (!res.ok) throw new Error('Failed to fetch controls');
            return res.json();
        },
        initialData: filtersMatchInitial
            ? { rows: initialControls, truncated: false }
            : undefined,
        // `initialDataUpdatedAt: Date.now()` tells React Query the SSR
        // payload is "fresh as of now" so it doesn't immediately
        // refetch on hydration. The exact ms doesn't matter — only the
        // relative ordering against staleTime — so the impurity is benign.
        // eslint-disable-next-line react-hooks/purity
        initialDataUpdatedAt: filtersMatchInitial ? Date.now() : 0,
        staleTime: 30_000,
    });

    const rawControls = controlsQuery.data?.rows ?? [];
    const truncated = controlsQuery.data?.truncated ?? false;
    const loading = controlsQuery.isLoading && !controlsQuery.data;

    // ─── PR-1: org-parity sortable headers ───
    // Client-side sort over the loaded controls. The server returns
    // by its canonical order (annexId/code asc); when the user
    // clicks a sortable header the page re-orders the in-memory
    // slice without a refetch. `sortBy` + `sortOrder` flow into
    // the shared table primitive as the sortableColumns surface.
    const [sortBy, setSortBy] = useState<string | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
        undefined,
    );
    const controls = useMemo(() => {
        if (!sortBy) return rawControls;
        const accessor = (c: ControlListItem): string | number => {
            switch (sortBy) {
                case 'code':
                    return (c.code || c.annexId || '').toString();
                case 'name':
                    return (c.name || '').toString();
                case 'status':
                    return (c.status || '').toString();
                case 'category':
                    return (c.category || '').toString();
                case 'frequency':
                    return (c.frequency || '').toString();
                case 'owner':
                    return (c.owner?.name || c.owner?.email || '').toString();
                default:
                    return '';
            }
        };
        const dir = sortOrder === 'asc' ? 1 : -1;
        return [...rawControls].sort((a, b) => {
            const av = accessor(a);
            const bv = accessor(b);
            if (av === bv) return 0;
            return av > bv ? dir : -dir;
        });
    }, [rawControls, sortBy, sortOrder]);
    const sortableColumns = useMemo(
        () => ['code', 'name', 'status', 'category', 'frequency', 'owner'],
        [],
    );

    // ─── PR-1: org-parity progressive disclosure ───
    // Above the threshold (50 rows), render the first slice and
    // expose a "Load more …" button. Below the threshold, the table
    // renders all rows immediately. The hook owns the window size;
    // resetting happens on a fresh mount only (re-filtering keeps
    // the window so a narrowed result stays fully visible).
    const {
        visibleRows: visibleControls,
        totalCount: totalControlsCount,
        hasMore: hasMoreControls,
        loadMore: loadMoreControls,
    } = useThresholdLoadMore(controls);

    // ─── Filter defs with runtime-derived owner/category options ───
    const liveFilterDefs: FilterType[] = useMemo(
        () => buildControlFilters(controls),
        [controls],
    );

    // ─── R23-PR-D — KPI definitions for the Controls page ───
    // Status-based buckets aligned to the existing `status` filter.
    // The "In Progress" KPI buckets IN_PROGRESS + IMPLEMENTING under
    // one label visually, but the filter API sets only IN_PROGRESS;
    // pages that want a multi-status KPI extend the predicate.
    type ControlKpiId = 'total' | 'implemented' | 'inProgress' | 'notStarted';
    // guardrail-ignore: KPI counts across the loaded page, not a refilter.
    const totalControls = controls.length;
    // guardrail-ignore: KPI count, not a refilter.
    const implementedControls = controls.filter(
        (c) => c.status === 'IMPLEMENTED',
    ).length;
    // guardrail-ignore: KPI count, not a refilter.
    const inProgressControls = controls.filter(
        (c) => c.status === 'IN_PROGRESS' || c.status === 'IMPLEMENTING',
    ).length;
    // guardrail-ignore: KPI count, not a refilter.
    const notStartedControls = controls.filter(
        (c) => c.status === 'NOT_STARTED',
    ).length;
    const controlKpiDefs: ReadonlyArray<KpiFilterDef<ControlKpiId>> = useMemo(
        () => [
            {
                id: 'total',
                apply: (ctx) => ctx.clearAll(),
                isActive: (s) => Object.keys(s).length === 0,
            },
            {
                id: 'implemented',
                apply: (ctx) => ctx.set('status', 'IMPLEMENTED'),
                isActive: (s) => (s.status ?? []).includes('IMPLEMENTED'),
                clear: (ctx) => ctx.removeAll('status'),
            },
            {
                id: 'inProgress',
                apply: (ctx) => ctx.set('status', 'IN_PROGRESS'),
                isActive: (s) => (s.status ?? []).includes('IN_PROGRESS'),
                clear: (ctx) => ctx.removeAll('status'),
            },
            {
                id: 'notStarted',
                apply: (ctx) => ctx.set('status', 'NOT_STARTED'),
                isActive: (s) => (s.status ?? []).includes('NOT_STARTED'),
                clear: (ctx) => ctx.removeAll('status'),
            },
        ],
        [],
    );
    const { activeKpiId: activeControlKpi, toggle: toggleControlKpi } =
        useKpiFilter(controlKpiDefs);

    // ─── Column visibility (Epic 52 / R10-PR6) ───
    // Pagination removed — internal scroll inside the table card
    // (ListPageShell.Body + DataTable fillBody) shows all rows.
    const controlColumnList = useMemo(
        () => [
            { id: 'code', label: 'Code' },
            { id: 'name', label: 'Title' },
            // Framework-tagged control category, derived per-control via
            // `categorizeControl` (ISO 27001 granular Annex domain, or
            // the framework-native category for other frameworks) —
            // mirrors the Browse rail's category grouping.
            { id: 'category', label: 'Category' },
            { id: 'status', label: 'Status' },
            { id: 'applicability', label: 'Applicability' },
            { id: 'owner', label: 'Owner' },
            { id: 'frequency', label: 'Frequency', defaultVisible: false },
            { id: 'tasks', label: 'Tasks' },
            { id: 'evidence', label: 'Evidence' },
        ],
        [],
    );
    const {
        columnVisibility,
        setColumnVisibility,
        dropdown: columnsDropdown,
    } = useColumnsDropdown({
        storageKey: 'inflect:col-vis:controls',
        columns: controlColumnList,
    });
    // ─── Mutation: status cycle ───

    const statusMutation = useMutation({
        mutationFn: async ({ controlId, newStatus }: { controlId: string; newStatus: string }) => {
            const res = await fetch(apiUrl(`/controls/${controlId}/status`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: newStatus }),
            });
            if (!res.ok) throw new Error('Status update failed');
            return res.json();
        },
        onMutate: async ({ controlId, newStatus }) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.controls.all(tenantSlug) });

            const listKey = queryKeys.controls.list(tenantSlug, queryKeyFilters);
            // PR-5 — cache value is `CappedList<ControlListItem>` (the API
            // returns `{ rows, truncated }`); preserve the `truncated` flag
            // and only rewrite `rows`.
            const previousList = queryClient.getQueryData<CappedList<ControlListItem>>(listKey);

            if (previousList) {
                queryClient.setQueryData<CappedList<ControlListItem>>(listKey, (old) =>
                    old
                        ? {
                              ...old,
                              rows: old.rows.map(c =>
                                  c.id === controlId ? { ...c, status: newStatus } : c,
                              ),
                          }
                        : old,
                );
            }

            return { previousList, listKey };
        },
        onError: (_err, _vars, context) => {
            if (context?.previousList) {
                queryClient.setQueryData(context.listKey, context.previousList);
            }
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.controls.all(tenantSlug) });
        },
    });

    // ─── Row selection → selection-summary rail (right-rail Phase 2) ───
    // The page owns the selection state; DataTable is controlled via
    // `selectedRows` + `onRowSelectionChange`. When ≥1 row is selected
    // (and the viewer can edit), the `aside` slot mounts the
    // selection-summary rail with the bulk-status verbs — a calmer,
    // persistent home than the floating batch-action toolbar.
    const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

    // The rail is gated on the *settled* selection, not the live one.
    // DataTable's R13-PR14 click model has a single click toggle row
    // selection and a double-click navigate — so a double-click toggles
    // selection on, then off, within the double-click window. Gating
    // the rail (a layout-reflowing surface) on the live selection would
    // flash it in and then out mid-double-click, and the reflow between
    // the two physical clicks breaks double-click-to-navigate. Settling
    // the selection for 250ms before the rail reacts means a
    // double-click never trips it; a genuine single-click selection
    // (which stays put) mounts the rail a quarter-second later —
    // imperceptible.
    const [settledSelection, setSettledSelection] =
        useState<RowSelectionState>({});
    useEffect(() => {
        const t = setTimeout(() => setSettledSelection(rowSelection), 250);
        return () => clearTimeout(t);
    }, [rowSelection]);
    const selectedIds = useMemo(
        // guardrail-ignore: reads the truthy keys out of the local RowSelectionState record (selected row ids) — not server-data filtering.
        () => Object.keys(settledSelection).filter((id) => settledSelection[id]),
        [settledSelection],
    );
    const canEditControls = appPermissions.controls.edit;
    const bulkSetStatus = (newStatus: string) => {
        for (const id of selectedIds) {
            statusMutation.mutate({ controlId: id, newStatus });
        }
    };

    // Stable DataTable callbacks — see the apiUrl/tenantHref note above.
    // `handleRowClick` is the double-click→navigate handler; keeping it
    // referentially stable means a selection-toggle re-render does not
    // rebuild the table's column model.
    const handleRowClick = useCallback(
        (row: Row<ControlListItem>) =>
            router.push(tenantHref(`/controls/${row.original.id}`)),
        [router, tenantHref],
    );
    const getControlRowId = useCallback((c: ControlListItem) => c.id, []);
    const handleRowSelectionChange = useCallback(
        (rows: Row<ControlListItem>[]) =>
            setRowSelection(
                Object.fromEntries(rows.map((r) => [r.id, true])),
            ),
        [],
    );

    // ─── Helpers ───

    const taskStats = useCallback((c: ControlListItem) => {
        // Unified linked-task counts from `listControls` (TaskLink
        // CONTROL link OR the controlId FK). Falls back to the legacy
        // ControlTask relation only if the new fields are absent (older
        // cached payload), so the column never regresses to a crash.
        const total = c.taskTotal ?? c._count?.controlTasks ?? 0;
        const done =
            c.taskDone ??
            // guardrail-ignore: legacy fallback over the row's own array.
            c.controlTasks?.filter((t) => t.status === 'DONE').length ??
            0;
        return { total, done };
    }, []);

    // ── Column definitions ──
    const controlColumns = useMemo(() => createColumns<ControlListItem>([
        {
            accessorFn: (c) => c.code || c.annexId || '',
            id: 'code',
            header: 'Code',
            cell: ({ getValue }) => (
                <span className="text-xs text-content-muted font-mono">{getValue<string>() || '—'}</span>
            ),
        },
        {
            accessorKey: 'name',
            header: 'Title',
            cell: ({ row }) => (
                <TableTitleCell
                    href={tenantHref(`/controls/${row.original.id}`)}
                    id={`control-link-${row.original.id}`}
                >
                    {row.original.name}
                </TableTitleCell>
            ),
        },
        {
            // Framework-tagged control category, derived via
            // `categorizeControl`: ISO 27001 → granular Annex domain
            // (Access control, Physical & environmental, Cryptography,
            // …); other frameworks → their persisted TSC / section
            // category. The badge carries the category; the framework
            // it belongs to rides alongside as a small tag so a
            // multi-framework control set stays legible. Controls that
            // resolve to no category render `—`.
            id: 'category',
            header: 'Category',
            accessorFn: (c) => categorizeControl(c)?.category || '',
            cell: ({ row }) => {
                const cat = categorizeControl(row.original);
                if (!cat) {
                    return <span className="text-xs text-content-subtle">—</span>;
                }
                return (
                    <span className="inline-flex items-center gap-tight">
                        {cat.frameworkLabel && (
                            <span className="inline-flex items-center rounded border border-border-subtle bg-bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-content-muted">
                                {cat.frameworkLabel}
                            </span>
                        )}
                        {/* Default variant + `subtle` tone (R9-PR11) —
                            quieter than the status pill so the eye
                            anchors on Status first. */}
                        <StatusBadge>{cat.category}</StatusBadge>
                    </span>
                );
            },
        },
        {
            accessorKey: 'status',
            header: 'Status',
            cell: ({ row }) => {
                const c = row.original;
                // 2026-05-19 — inline-edit dropdown retired. The
                // cell is now a read-only badge; status changes
                // route through the per-control detail page (Edit
                // Control sheet) or the bulk-set toolbar actions
                // (Mark Implemented / Needs Review / Not Applicable).
                // Keeping the well-known `#status-pill-{id}` id on
                // the badge so existing E2E selectors stay valid.
                return (
                    <StatusBadge
                        id={`status-pill-${c.id}`}
                        variant={STATUS_BADGE[c.status] || 'neutral'}
                    >
                        {STATUS_LABELS[c.status] || c.status}
                    </StatusBadge>
                );
            },
        },
        {
            accessorKey: 'applicability',
            header: 'Applicability',
            cell: ({ row }) => {
                const c = row.original;
                // 2026-05-19 — inline-edit dropdown retired alongside
                // Status (see comment above). Applicability changes
                // route through the per-control detail page; the
                // justification modal is preserved there. Selector
                // id `#applicability-pill-{id}` kept for E2E parity.
                return (
                    <StatusBadge
                        id={`applicability-pill-${c.id}`}
                        variant={c.applicability === 'NOT_APPLICABLE' ? 'warning' : 'success'}
                    >
                        {c.applicability === 'NOT_APPLICABLE' ? 'N/A' : 'Yes'}
                    </StatusBadge>
                );
            },
        },
        {
            id: 'owner',
            header: 'Owner',
            accessorFn: (c) => c.owner?.name || c.owner?.email || '—',
            cell: ({ row }) => {
                const c = row.original;
                if (!c.owner) {
                    return <span className="text-xs text-content-subtle">—</span>;
                }
                const display = c.owner.name ?? c.owner.email ?? '?';
                const initial = display.charAt(0).toUpperCase();
                return (
                    <span
                        className="inline-flex items-center gap-1.5"
                        data-testid={`control-owner-${c.id}`}
                    >
                        <span
                            aria-hidden
                            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-bg-elevated text-[10px] font-medium text-content-emphasis"
                        >
                            {initial}
                        </span>
                        <span className="min-w-0 leading-tight">
                            <span className="block truncate text-xs text-content-emphasis">
                                {c.owner.name ?? c.owner.email}
                            </span>
                            {c.owner.name && c.owner.email && (
                                <span className="block truncate text-[10px] text-content-subtle">
                                    {c.owner.email}
                                </span>
                            )}
                        </span>
                    </span>
                );
            },
        },
        {
            id: 'frequency',
            header: 'Frequency',
            accessorFn: (c) => c.frequency ? FREQ_LABELS[c.frequency] || c.frequency : '—',
            cell: ({ getValue }) => (
                <span className="text-xs text-content-muted">{getValue<string>()}</span>
            ),
        },
        {
            id: 'tasks',
            header: 'Tasks',
            accessorFn: (c) => {
                const ts = taskStats(c);
                return `${ts.done}/${ts.total}`;
            },
            cell: ({ row }) => {
                const ts = taskStats(row.original);
                return (
                    <span className={ts.total > 0 && ts.done === ts.total ? 'text-content-success text-xs' : 'text-content-muted text-xs'}>
                        {ts.done}/{ts.total}
                    </span>
                );
            },
        },
        {
            id: 'evidence',
            header: 'Evidence',
            accessorFn: (c) => c._count?.evidenceLinks ?? 0,
            cell: ({ getValue, row }) => {
                const n = getValue<number>();
                return (
                    <span
                        className={`inline-flex items-center gap-1 text-xs ${n > 0 ? 'text-content-emphasis' : 'text-content-subtle'}`}
                        data-testid={`control-evidence-${row.original.id}`}
                    >
                        <Paperclip
                            size={12}
                            className={n > 0 ? 'text-content-success' : 'text-content-subtle'}
                            aria-hidden
                        />
                        {n}
                    </span>
                );
            },
        },
        {
            id: 'quick-edit',
            header: '',
            enableHiding: false,
            cell: ({ row }) => (
                appPermissions.controls.edit ? (
                    <button
                        type="button"
                        aria-label="Open control detail sheet"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-bg-muted hover:text-content-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={`control-quick-edit-${row.original.id}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSheetControlId(row.original.id);
                        }}
                    >
                        <AppIcon name="edit" size={14} />
                    </button>
                ) : null
            ),
        },
    ]), [appPermissions, tenantHref, taskStats]);

    // Selection-summary rail — mounted only when the viewer can edit
    // AND ≥1 row is selected. `<AsidePanel>` owns the collapse chrome +
    // the `<Sheet>` fallback below xl; `<SelectionSummaryPanel>` is the
    // content. Absent ⇒ the list page is single-column, unchanged.
    const selectionAside =
        canEditControls && selectedIds.length > 0 ? (
            <AsidePanel
                title="Selection"
                surfaceKey="controls-list"
                icon={<AppIcon name="controls" size={16} />}
            >
                <SelectionSummaryPanel
                    count={selectedIds.length}
                    resourceLabel={{ singular: 'control', plural: 'controls' }}
                    onClear={() => setRowSelection({})}
                    actions={[
                        {
                            label: 'Mark Implemented',
                            icon: <CheckCircle2 className="size-3.5" />,
                            onClick: () => bulkSetStatus('IMPLEMENTED'),
                        },
                        {
                            label: 'Mark Needs Review',
                            icon: <AlertTriangle className="size-3.5" />,
                            onClick: () => bulkSetStatus('NEEDS_REVIEW'),
                        },
                        {
                            label: 'Mark Not Applicable',
                            icon: <X className="size-3.5" />,
                            tone: 'danger',
                            onClick: () => bulkSetStatus('NOT_APPLICABLE'),
                        },
                    ]}
                />
            </AsidePanel>
        ) : undefined;

    // Browse rail — category accordion. The loaded controls are
    // grouped by their framework-native category, derived via
    // `categorizeControl`: ISO 27001 → granular Annex domain (Access
    // control, Physical & environmental, Cryptography, …); other
    // frameworks → their persisted TSC / section category. Each
    // category is a collapsible <Accordion> section TAGGED with the
    // framework it belongs to; expanding it reveals the controls in
    // that category, each carrying a status tag and linking to its
    // detail page. The rail NAVIGATES — it no longer filters the table.
    // When the tenant's controls span multiple frameworks, each
    // framework's categories appear as their own tagged groups.
    const categoryGroups = useMemo(() => {
        type Group = {
            key: string;
            frameworkKey: string;
            frameworkLabel: string;
            category: string;
            controls: ControlListItem[];
        };
        const map = new Map<string, Group>();
        for (const c of controls) {
            const cat = categorizeControl(c);
            if (!cat) continue;
            const key = `${cat.frameworkKey}::${cat.category}`;
            let g = map.get(key);
            if (!g) {
                g = { key, ...cat, controls: [] };
                map.set(key, g);
            }
            g.controls.push(c);
        }
        // Stable order: framework label A→Z, then the canonical ISO
        // domain order for ISO groups, then descending control count,
        // then category name as the final tie-break.
        const isoIndex = (name: string) => {
            const i = ISO27001_DOMAIN_ORDER.indexOf(name);
            return i === -1 ? Number.MAX_SAFE_INTEGER : i;
        };
        return Array.from(map.values()).sort((a, b) => {
            if (a.frameworkLabel !== b.frameworkLabel)
                return a.frameworkLabel.localeCompare(b.frameworkLabel);
            const ai = isoIndex(a.category);
            const bi = isoIndex(b.category);
            if (ai !== bi) return ai - bi;
            if (b.controls.length !== a.controls.length)
                return b.controls.length - a.controls.length;
            return a.category.localeCompare(b.category);
        });
    }, [controls]);

    const railRowClass =
        'flex w-full items-center justify-between gap-tight rounded-md px-2 py-1 text-left text-xs text-content-default hover:bg-bg-muted/50 focus-visible:outline-none focus-visible:bg-bg-muted';

    // Controlled accordion — lets the "Expand all / Collapse all"
    // toggle drive every section at once.
    const [openSections, setOpenSections] = useState<string[]>([]);
    const allSectionKeys = useMemo(
        () => categoryGroups.map((g) => g.key),
        [categoryGroups],
    );
    const allExpanded =
        allSectionKeys.length > 0 &&
        openSections.length === allSectionKeys.length;

    const browseAside = (
        <AsidePanel
            title="Browse"
            surfaceKey="controls-list-browse"
            defaultWidth={480}
            icon={<AppIcon name="controls" size={16} />}
        >
            <div data-testid="controls-browse-aside" className="space-y-default">
                {categoryGroups.length === 0 ? (
                    <p className="px-2 py-1 text-xs text-content-subtle">
                        No categorised controls yet.
                    </p>
                ) : (
                    <>
                        <div className="flex justify-end">
                            <button
                                type="button"
                                onClick={() =>
                                    setOpenSections(
                                        allExpanded ? [] : allSectionKeys,
                                    )
                                }
                                className="rounded-md px-2 py-1 text-xs font-medium text-content-muted hover:bg-bg-muted/50 hover:text-content-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                data-testid="controls-browse-expand-all"
                            >
                                {allExpanded ? 'Collapse all' : 'Expand all'}
                            </button>
                        </div>
                        {/* Scroll stays INSIDE the browse box (viewport-
                            clamped) so an all-expanded rail doesn't push
                            the whole page — mirrors the table's
                            fillBody scroll. */}
                        <div className="max-h-[calc(100vh-15rem)] overflow-y-auto pr-1">
                            <Accordion
                                type="multiple"
                                value={openSections}
                                onValueChange={setOpenSections}
                                className="space-y-0"
                            >
                                {categoryGroups.map((g) => (
                            <AccordionItem
                                key={g.key}
                                value={g.key}
                                density="compact"
                                data-category-group={g.key}
                            >
                                <AccordionTrigger size="sm" className="px-2">
                                    <span className="flex min-w-0 flex-1 items-center justify-between gap-tight pr-2">
                                        <span className="flex min-w-0 flex-col items-start gap-0.5">
                                            <span className="truncate font-medium text-content-default">
                                                {g.category}
                                            </span>
                                            {g.frameworkLabel && (
                                                <span
                                                    className="text-[10px] font-medium uppercase tracking-wide text-content-subtle"
                                                    data-framework-tag={g.frameworkLabel}
                                                >
                                                    {g.frameworkLabel}
                                                </span>
                                            )}
                                        </span>
                                        <span className="shrink-0 tabular-nums text-content-subtle">
                                            {g.controls.length}
                                        </span>
                                    </span>
                                </AccordionTrigger>
                                <AccordionContent size="sm">
                                    <ul
                                        className="flex flex-col gap-0.5 pb-1"
                                        role="list"
                                    >
                                        {g.controls.map((c) => (
                                            <li key={c.id}>
                                                <button
                                                    type="button"
                                                    className={railRowClass}
                                                    data-control-id={c.id}
                                                    onClick={() =>
                                                        router.push(
                                                            tenantHref(
                                                                `/controls/${c.id}`,
                                                            ),
                                                        )
                                                    }
                                                >
                                                    <span className="truncate">
                                                        {c.code || c.annexId
                                                            ? `${c.code || c.annexId} · ${c.name}`
                                                            : c.name}
                                                    </span>
                                                    <StatusBadge
                                                        variant={
                                                            STATUS_BADGE[c.status] ||
                                                            'neutral'
                                                        }
                                                    >
                                                        {STATUS_LABELS[c.status] ||
                                                            c.status}
                                                    </StatusBadge>
                                                </button>
                                            </li>
                                        ))}
                                    </ul>
                                </AccordionContent>
                            </AccordionItem>
                                ))}
                            </Accordion>
                        </div>
                    </>
                )}
            </div>
        </AsidePanel>
    );

    // AI Assist — mirror of Risks' co-pilot rail. Quiet (44px spine)
    // by default; the same `<AiAssistRail>` content + `/risks/ai`
    // destination as the Risks page so the panel reads as one
    // shared co-pilot across registers, not a stub.
    const aiAssistAside = appPermissions.controls.edit ? (
        <AsidePanel
            title="AI Assist"
            surfaceKey="controls-list-ai"
            defaultCollapsed
            icon={<Sparkle3 className="h-4 w-4" />}
        >
            <AiAssistRail aiHref={tenantHref('/risks/ai')} />
        </AsidePanel>
    ) : null;

    // Compose the aside slot — selection summary first (only
    // appears on multi-row selection), then the always-on browse
    // rail, then the AI assist co-pilot. They stack vertically
    // inside the docked third column.
    const composedAside = (
        <div className="flex flex-col gap-default">
            {selectionAside}
            {browseAside}
            {aiAssistAside}
        </div>
    );

    return (
        <EntityListPage<ControlListItem>
            className="animate-fadeIn gap-section"
            aside={composedAside}
            banner={<TruncationBanner truncated={truncated} />}
            // PR-1 — org-parity load-more footer. Renders below the
            // DataTable inside the same body card; gated on
            // `hasMore` inside the primitive so it stays hidden when
            // every row is already visible (≤ threshold or after a
            // narrowing filter).
            tableFooter={
                <TableLoadMoreFooter
                    hasMore={hasMoreControls}
                    visibleCount={visibleControls.length}
                    totalCount={totalControlsCount}
                    onLoadMore={loadMoreControls}
                    resourceName="controls"
                    testId="tenant-controls-load-more"
                />
            }
            header={{
                breadcrumbs: [
                    // Was `tenantHref('/')` — that resolves to `/t/<slug>/`
                    // which has no page.tsx and 404s. Next.js auto-prefetches
                    // every visible <Link>, so the failing prefetch kept the
                    // page in a perpetual "fetch in flight" state and made
                    // `waitForLoadState('networkidle')` hang for the full
                    // 180s test timeout in every Playwright spec on this
                    // page (create-control-modal, controls-filter-epic53,
                    // control-edit-modal, controls-enhanced).
                    { label: 'Dashboard', href: tenantHref('/dashboard') },
                    { label: 'Controls' },
                ],
                title: (
                    <>
                        <AppIcon name="controls" className="inline-block mr-2 align-text-bottom" />
                        {' '}
                        Controls
                    </>
                ),
                // Roadmap-2 PR-4 + PR-11 — editorial framing
                // replaces the count chip. Pages still surface
                // the count in the table body (DataTable shows
                // row count); the header line carries the
                // editorial intent.
                description:
                    'Every control mapped to its requirements and evidence.',
                actions: (
                    <>
                        {/* Sankey is read-only and informational — keep it
                            outside the create-permission gate so READERs
                            can still glance at the asset → risk → control
                            flow. */}
                        <Link href={tenantHref('/controls/sankey')} className={buttonVariants({ variant: 'secondary', size: 'sm' })} id="controls-sankey-btn">
                            <AppIcon name="share" size={14} /> Sankey
                        </Link>
                        {appPermissions.controls.create && (
                            <>
                                <Link href={tenantHref('/controls/dashboard')} className={buttonVariants({ variant: 'secondary', size: 'sm' })} id="controls-dashboard-btn">
                                    <AppIcon name="dashboard" size={14} /> Dashboard
                                </Link>
                                <Link href={tenantHref('/frameworks')} className={buttonVariants({ variant: 'secondary', size: 'sm' })} id="frameworks-btn">
                                    <AppIcon name="frameworks" size={14} /> Frameworks
                                </Link>
                                <Link href={tenantHref('/controls/templates')} className={buttonVariants({ variant: 'secondary', size: 'sm' })} id="install-templates-btn">
                                    <AppIcon name="templates" size={14} /> Install from Templates
                                </Link>
                                <Button
                                    variant="primary"
                                    icon={<Plus className="-ml-0.5 -mr-2.5" />}
                                    id="new-control-btn"
                                    onClick={() => setIsCreateOpen(true)}
                                >
                                    Control
                                </Button>
                            </>
                        )}
                    </>
                ),
            }}
            kpis={
                /* R23-PR-D — KPI strip above the filter toolbar.
                   EntityListPage owns the placement; the page owns
                   the KPI definitions + the card content. */
                <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                    <KpiFilterCard
                        label="Total controls"
                        value={totalControls}
                        onClick={() => toggleControlKpi('total')}
                        selected={activeControlKpi === 'total'}
                    />
                    <KpiFilterCard
                        label="Implemented"
                        value={implementedControls}
                        tone="success"
                        onClick={() => toggleControlKpi('implemented')}
                        selected={activeControlKpi === 'implemented'}
                    />
                    <KpiFilterCard
                        label="In progress"
                        value={inProgressControls}
                        tone="attention"
                        onClick={() => toggleControlKpi('inProgress')}
                        selected={activeControlKpi === 'inProgress'}
                    />
                    <KpiFilterCard
                        label="Not started"
                        value={notStartedControls}
                        tone={notStartedControls > 0 ? 'critical' : 'default'}
                        onClick={() => toggleControlKpi('notStarted')}
                        selected={activeControlKpi === 'notStarted'}
                    />
                </div>
            }
            filters={{
                defs: liveFilterDefs,
                searchId: 'controls-search',
                searchPlaceholder: 'Search controls…',
                toolbarActions: columnsDropdown,
            }}
            table={{
                // PR-1 — sliced data via useThresholdLoadMore so the
                // table never paints more than the windowed rows at
                // once. The footer (see `tableFooter` below) handles
                // progressive disclosure.
                data: visibleControls,
                columns: controlColumns,
                loading,
                getRowId: getControlRowId,
                // PR-1 — sortable headers, matching the org-level
                // tables (with up/down arrow indicators baked into
                // the shared table primitive).
                sortableColumns,
                sortBy,
                sortOrder,
                onSortChange: ({ sortBy: nextBy, sortOrder: nextOrder }) => {
                    setSortBy(nextBy);
                    setSortOrder(nextOrder);
                },
                // Epic 68 — Controls page is the canonical opt-out
                // for auto-virtualization. Per product directive the
                // existing card scrolling on Controls stays as it is;
                // bespoke per-row affordances + the JS whole-row clip
                // depend on the standard <table> layout.
                virtualize: false,
                onRowClick: handleRowClick,
                emptyState: hasActive ? (
                    <EmptyState
                        size="sm"
                        variant="no-results"
                        title="No controls match your filters"
                        description="Try widening your search or clearing one of the active filters."
                        secondaryAction={{
                            label: 'Clear filters',
                            onClick: () => clearAll(),
                        }}
                    />
                ) : (
                    <EmptyState
                        size="sm"
                        variant="no-records"
                        title="No controls yet"
                        description="Start with a pre-built framework or define your own control."
                        primaryAction={{
                            label: 'Install templates',
                            href: tenantHref('/controls/templates'),
                        }}
                        secondaryAction={{
                            label: 'Create control',
                            onClick: () => setIsCreateOpen(true),
                        }}
                    />
                ),
                resourceName: (p) => (p ? 'controls' : 'control'),
                columnVisibility,
                onColumnVisibilityChange: setColumnVisibility,
                'data-testid': 'controls-table',
                className: 'hover:bg-bg-muted',
                // Right-rail Phase 2 — selection is page-controlled so
                // the selection-summary rail can render the bulk-status
                // verbs (see `selectionAside` above). The floating
                // batch-action toolbar (`batchActions`) is retired here
                // in favour of the rail. For viewers without edit
                // permission, selection is left off entirely — no
                // checkboxes, no rail — exactly the prior behaviour.
                selectedRows: canEditControls ? rowSelection : undefined,
                onRowSelectionChange: canEditControls
                    ? handleRowSelectionChange
                    : undefined,
            }}
        >
            {/* Create Control Modal (Epic 54) */}
            <NewControlModal
                open={isCreateOpen}
                setOpen={setIsCreateOpen}
                tenantSlug={tenantSlug}
            />

            {/* Control Detail / Edit Sheet (Epic 54) */}
            <ControlDetailSheet
                controlId={sheetControlId}
                setControlId={setSheetControlId}
                tenantSlug={tenantSlug}
                apiUrl={apiUrl}
                tenantHref={tenantHref}
                canWrite={appPermissions.controls.edit}
            />

        </EntityListPage>
    );
}

