'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

/* eslint-disable react-hooks/exhaustive-deps -- Various useMemo dep arrays in this file deliberately omit identity-unstable callbacks (handlers/derived arrays recreated each render). The proper structural fix is wrapping parent-level callbacks in useCallback. Tracked as follow-up; existing per-line eslint-disable-next-line markers preserved. */
import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Plus } from '@/components/ui/icons/nucleo';
import { NewTaskModal } from './NewTaskModal';
import { AsidePanel } from '@/components/ui/aside-panel';
import { TaskEditPanel } from '@/app/t/[tenantSlug]/(app)/controls/TaskEditPanel';
import { AppIcon } from '@/components/icons/AppIcon';
import { useSWRConfig } from 'swr';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantMutation } from '@/lib/hooks/use-tenant-mutation';
import { CACHE_KEYS } from '@/lib/swr-keys';
import type { CappedList } from '@/lib/list-backfill-cap';
import { TruncationBanner } from '@/components/ui/TruncationBanner';
import { useThresholdLoadMore } from '@/components/ui/hooks';
import { TimestampTooltip } from '@/components/ui/timestamp-tooltip';
import { Tooltip } from '@/components/ui/tooltip';
import { TERMINAL_WORK_ITEM_STATUSES } from '@/app-layer/domain/work-item-status';
import { DataTable, createColumns, useColumnsDropdown, sortRowsByDisplay, type SortAccessors } from '@/components/ui/table';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
    useFilterCardVisibility,
    filtersToCards,
    selectVisibleFilters,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import { buttonVariants } from '@/components/ui/button-variants';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import { buildTaskFilters, TASK_FILTER_KEYS } from './filter-defs';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { useKpiFilter, type KpiFilterDef } from '@/components/ui/kpi-filter';
import { useKpiTrends, buildKpiSparklines, buildKpiSparklineNullable, centeredSparklineDomain, assignSparklineVariants } from '@/lib/charts/kpi-trends';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { UserCombobox } from '@/components/ui/user-combobox';
import { BulkActionBar, type BulkActionDef } from '@/components/ui/bulk-action-bar';
import { ownerDisplayName } from '@/lib/owner-display';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import {
    parseYMD,
    startOfUtcDay,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';

const STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    OPEN: 'neutral', TRIAGED: 'info', IN_PROGRESS: 'info',
    BLOCKED: 'error', RESOLVED: 'success', CLOSED: 'neutral', CANCELED: 'neutral',
};
const STATUS_LABELS: Record<string, string> = {
    OPEN: 'Open', TRIAGED: 'Triaged', IN_PROGRESS: 'In Progress',
    BLOCKED: 'Blocked', RESOLVED: 'Resolved', CLOSED: 'Closed', CANCELED: 'Canceled',
};
const SEVERITY_BADGE: Record<string, StatusBadgeVariant> = {
    INFO: 'neutral', LOW: 'neutral', MEDIUM: 'warning',
    HIGH: 'error', CRITICAL: 'error',
};
const TYPE_LABELS: Record<string, string> = {
    AUDIT_FINDING: 'Audit Finding', CONTROL_GAP: 'Control Gap',
    INCIDENT: 'Incident', IMPROVEMENT: 'Improvement', TASK: 'Task',
};
// Bulk status only offers ACTIVE transitions. Terminal statuses
// (CLOSED / CANCELED) require a per-task resolution note (S8), which
// the bulk bar can't collect — closing is a deliberate single-task
// action via the task detail page. RESOLVED is retired everywhere.
const BULK_STATUS_CB_OPTIONS: ComboboxOption[] = ['OPEN', 'TRIAGED', 'IN_PROGRESS', 'BLOCKED'].map(s => ({ value: s, label: STATUS_LABELS[s] || s }));

interface TaskListItem {
    id: string;
    key: string | null;
    title: string;
    type: string;
    severity: string;
    status: string;
    dueAt: string | null;
    createdAt: string;
    updatedAt: string;
    assignee: { name: string } | null;
    assigneeUserId: string | null;
}

interface TasksClientProps {
    initialTasks: TaskListItem[];
    initialFilters?: Record<string, string>;
    tenantSlug: string;
    appPermissions: {
        tasks: { create: boolean; edit: boolean };
    };
}

/**
 * Client island for tasks — handles filters, bulk selection, optimistic mutations.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 */
export function TasksClient(props: TasksClientProps) {
    const filterCtx = useFilterContext([], TASK_FILTER_KEYS, {
        serverFilters: props.initialFilters,
    });
    return (
        <FilterProvider value={filterCtx}>
            <TasksPageInner {...props} />
        </FilterProvider>
    );
}

function TasksPageInner({
    initialTasks,
    initialFilters,
    tenantSlug,
    appPermissions,
}: TasksClientProps) {
    const apiUrl = (path: string) => `/api/t/${tenantSlug}${path}`;
    const tenantHref = (path: string) => `/t/${tenantSlug}${path}`;
    const { mutate: swrMutate } = useSWRConfig();
    const router = useRouter();

    // Hydration marker — signals to E2E tests that React event handlers are attached
    const [hydrated, setHydrated] = useState(false);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    useEffect(() => { setHydrated(true); }, []);

    // Modal-form P2 — create-task modal auto-opens on `?create=1`
    // (the redirect target from `/tasks/new`). Flag stripped after
    // open so back/forward doesn't reopen the modal.
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    // Quick-view side panel — mirrors the Controls page. Single-click a task
    // TITLE (or the row pencil) opens the editable task in a non-modal
    // <AsidePanel> (docked rail ≥xl, Sheet <xl); the table stays visible so
    // clicking another task switches the panel in place. Row double-click
    // still navigates to the full detail page.
    const [selectedTask, setSelectedTask] = useState<TaskListItem | null>(null);
    const searchParams = useSearchParams();
    useEffect(() => {
        if (searchParams?.get('create') === '1') {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsCreateOpen(true);
            const next = new URLSearchParams(searchParams.toString());
            next.delete('create');
            const qs = next.toString();
            router.replace(
                `/t/${tenantSlug}/tasks${qs ? `?${qs}` : ''}`,
                { scroll: false },
            );
        }
        // First-mount only.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Null until after hydration — time-dependent UI (overdue/SLA
    // badges) reads this so SSR and first-client render match exactly.
    const hydratedNow = useHydratedNow();

    const filterCtx = useFilters();
    const { state, search, hasActive } = filterCtx;

    // Bulk selection — the <BulkActionBar> owns the action/value form state;
    // this client only tracks which rows are selected.
    const [selected, setSelected] = useState<Set<string>>(new Set());

    // ─── Query: tasks list (hydrated with server data) ───

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
        const keys = new Set([...Object.keys(queryKeyFilters), ...Object.keys(initialFilters!)]);
        for (const k of keys) {
            if ((queryKeyFilters[k] ?? '') !== (initialFilters![k] ?? '')) return false;
        }
        return true;
    }, [queryKeyFilters, initialFilters, serverHadFilters, hasActive]);

    // Epic 69 — same SWR-first read pattern as policies / risks /
    // evidence / vendors. Filter-aware key + server-rendered
    // fallbackData (gated against filter divergence). The prior
    // `staleTime: 30_000` setting maps to SWR's
    // `dedupingInterval` — the Epic 69 hook's default is 5 s
    // already, so we bump it here to keep the previous behaviour
    // (dampens revalidation thrash during bulk-select interaction).
    const tasksKey = useMemo(() => {
        const qs = fetchParams.toString();
        return qs ? `${CACHE_KEYS.tasks.list()}?${qs}` : CACHE_KEYS.tasks.list();
    }, [fetchParams]);

    // PR-9 — API returns `{ rows, truncated }` (mirrors the seven
    // other list-page entities). SSR initial wraps with
    // `truncated: false` because the SSR cap (100) is well below
    // the backfill cap (5000) — the SSR slice never trips truncation
    // by itself.
    const tasksQuery = useTenantSWR<CappedList<TaskListItem>>(tasksKey, {
        fallbackData: filtersMatchInitial
            ? { rows: initialTasks, truncated: false }
            : undefined,
        dedupingInterval: 30_000,
    });

    const tasks = tasksQuery.data?.rows ?? [];
    const truncated = tasksQuery.data?.truncated ?? false;
    const loading = tasksQuery.isLoading && !tasksQuery.data;

    // ─── Sortable headers (parity with the Controls table) ───
    // Clicking a sortable header re-orders the in-memory rows; `sortBy`
    // + `sortOrder` flow into the shared table primitive's
    // `sortableColumns` surface. Sort runs BEFORE the load-more window
    // so the visible slice reflects the chosen order.
    const [sortBy, setSortBy] = useState<string | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
        undefined,
    );
    // One accessor per sortable column id, each returning the value the
    // matching COLUMN DISPLAYS (not the raw field) so sorting groups
    // same-displayed-value rows. type → TYPE_LABELS label, status →
    // STATUS_LABELS label (both cells render the label, not the raw enum);
    // assignee mirrors its column accessorFn ('—' fallback). Sort still
    // runs BEFORE the load-more window below.
    const sortAccessors = useMemo<SortAccessors<TaskListItem>>(
        () => ({
            title: (t) => t.title || '',
            type: (t) => TYPE_LABELS[t.type] || t.type,
            severity: (t) => t.severity || '',
            status: (t) => STATUS_LABELS[t.status] || t.status,
            assignee: (t) => t.assignee?.name || '—',
            dueAt: (t) => t.dueAt || '',
            updatedAt: (t) => t.updatedAt || '',
        }),
        [],
    );
    const sortedTasks = useMemo(
        () => sortRowsByDisplay(tasks, sortAccessors, sortBy, sortOrder),
        [tasks, sortAccessors, sortBy, sortOrder],
    );
    const sortableColumns = useMemo(
        () => ['title', 'type', 'severity', 'status', 'assignee', 'dueAt', 'updatedAt'],
        [],
    );

    // Progressive disclosure — same org-parity "Load more" affordance
    // as the Controls table. Above the threshold the table renders the
    // first slice and the footer reveals more; below it, all rows show.
    const {
        visibleRows: visibleTasks,
        hasMore: hasMoreTasks,
        loadMore: loadMoreTasks,
    } = useThresholdLoadMore(sortedTasks);
    const liveFilters = useMemo(
        () => buildTaskFilters(tasks as unknown as Parameters<typeof buildTaskFilters>[0]),
        [tasks],
    );
    const filterCards = useMemo(() => filtersToCards(liveFilters), [liveFilters]);
    const { visibleCards, dropdown: filtersDropdown } = useFilterCardVisibility({
        storageKey: 'inflect:filter-vis:tasks',
        cards: filterCards,
    });
    const visibleFilterDefs = useMemo(
        () => selectVisibleFilters(visibleCards, liveFilters),
        [visibleCards, liveFilters],
    );

    const isOverdue = (task: TaskListItem) => !!(hydratedNow && task.dueAt && new Date(task.dueAt) < hydratedNow && !(TERMINAL_WORK_ITEM_STATUSES as readonly string[]).includes(task.status));

    // ─── R23-PR-E — KPI definitions for the Tasks page ───
    // Aligned to `status` + `due` filter keys (both filterable
    // server-side). "Due this week" uses the `due=next7d` pseudo-
    // enum the API already accepts.
    type TaskKpiId = 'total' | 'open' | 'overdue' | 'dueWeek';
    // guardrail-ignore: KPI counts across the loaded page, not a refilter.
    const totalTasks = tasks.length;
    // guardrail-ignore: KPI count, not a refilter.
    const openTasks = tasks.filter((t: TaskListItem) => t.status === 'OPEN').length;
    // guardrail-ignore: KPI count, not a refilter.
    const overdueTasks = tasks.filter(isOverdue).length;
    // guardrail-ignore: KPI count, not a refilter.
    const weekFromNow = hydratedNow
        ? new Date(hydratedNow.getTime() + 7 * 24 * 60 * 60 * 1000)
        : null;
    const dueWeekTasks = tasks.filter(
        (t: TaskListItem) =>
            !!hydratedNow &&
            !!weekFromNow &&
            !!t.dueAt &&
            new Date(t.dueAt) >= hydratedNow &&
            new Date(t.dueAt) <= weekFromNow,
    ).length;
    const taskKpiDefs: ReadonlyArray<KpiFilterDef<TaskKpiId>> = useMemo(
        () => [
            {
                id: 'total',
                apply: (ctx) => ctx.clearAll(),
                isActive: (s) => Object.keys(s).length === 0,
            },
            {
                id: 'open',
                apply: (ctx) => ctx.set('status', 'OPEN'),
                isActive: (s) => (s.status ?? []).includes('OPEN'),
                clear: (ctx) => ctx.removeAll('status'),
            },
            {
                id: 'overdue',
                apply: (ctx) => ctx.set('due', 'overdue'),
                isActive: (s) => (s.due ?? []).includes('overdue'),
                clear: (ctx) => ctx.removeAll('due'),
            },
            {
                id: 'dueWeek',
                apply: (ctx) => ctx.set('due', 'next7d'),
                isActive: (s) => (s.due ?? []).includes('next7d'),
                clear: (ctx) => ctx.removeAll('due'),
            },
        ],
        [],
    );
    const { activeKpiId: activeTaskKpi, toggle: toggleTaskKpi } =
        useKpiFilter(taskKpiDefs);

    // Canonical KPI-card sparklines (shared hook). total/open/overdue are
    // always-present snapshot series; dueWeek is a forward-only nullable
    // column — empty until history accrues, never a fake ramp.
    const trendsQuery = useKpiTrends(tenantSlug);
    const taskTrends = useMemo(() => {
        const points = trendsQuery.data?.dataPoints;
        const base = buildKpiSparklines(points, (d) => d.tasksTotal, {
            total: (d) => d.tasksTotal,
            open: (d) => d.tasksOpen,
            overdue: (d) => d.tasksOverdue,
        });
        return {
            ...base,
            dueWeek: buildKpiSparklineNullable(points, (d) => d.tasksDueSoon7d),
        };
    }, [trendsQuery.data]);
    // Distinct sparkline colour per card (canonical allocator).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const sparkColors = useMemo(
        () => assignSparklineVariants(['total', 'open', 'overdue', 'dueWeek']),
        [],
    );


    // ─── Mutation: bulk actions (Epic 69 — useTenantMutation) ────
    //
    // Migrated from React Query's `useMutation` + `onMutate` /
    // `onError` rollback hooks. The hook now handles the lifecycle
    // — `optimisticUpdate` walks the cached task list and patches
    // every selected row with the new field; rollback is automatic
    // on throw via `rollbackOnError: true` (the default). After
    // success the post-mutation revalidation refreshes the
    // current filter view, and `invalidateAllTasks()` below fans
    // out to sibling filter variants so a different filter view
    // doesn't show stale state.
    const invalidateAllTasks = useCallback(() => {
        const tasksUrlPrefix = apiUrl(CACHE_KEYS.tasks.list());
        return swrMutate(
            (key) =>
                typeof key === 'string' &&
                (key === tasksUrlPrefix ||
                    key.startsWith(`${tasksUrlPrefix}?`)),
            undefined,
            { revalidate: true },
        );
    }, [apiUrl, swrMutate]);

    interface BulkVars {
        action: string;
        value: string;
        ids: string[];
        /** Display label for `value` (assignee name) — optimistic UI only. */
        label?: string;
    }

    // PR-9 — cache value is `CappedList<TaskListItem>`; preserve the
    // `truncated` flag and only rewrite `rows`. Same shape change as
    // the other six SWR-backed clients (PR-5 corrective).
    const bulkMutation = useTenantMutation<CappedList<TaskListItem>, BulkVars, unknown>({
        key: tasksKey,
        mutationFn: async ({ action, value, ids }) => {
            let url = '';
            const body: { taskIds: string[]; assigneeUserId?: string | null; status?: string; dueAt?: string | null } = { taskIds: ids };

            if (action === 'assign') {
                url = apiUrl('/tasks/bulk/assign');
                body.assigneeUserId = value || null;
            } else if (action === 'status') {
                url = apiUrl('/tasks/bulk/status');
                body.status = value;
            } else if (action === 'due') {
                url = apiUrl('/tasks/bulk/due');
                body.dueAt = value || null;
            } else if (action === 'delete') {
                url = apiUrl('/tasks/bulk/delete');
            }

            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error('Bulk action failed');
            return res.json();
        },
        optimisticUpdate: (current, { action, value, ids, label }) => {
            if (action === 'delete') {
                return {
                    // guardrail-ignore: optimistic removal of just-deleted rows from the loaded page, not a server-data re-filter.
                    rows: (current?.rows ?? []).filter((task) => !ids.includes(task.id)),
                    truncated: current?.truncated ?? false,
                };
            }
            const rows = (current?.rows ?? []).map((task) => {
                if (!ids.includes(task.id)) return task;
                if (action === 'status') return { ...task, status: value };
                if (action === 'assign')
                    return {
                        ...task,
                        assigneeUserId: value || null,
                        // Show the picked assignee's name (not the raw user id);
                        // server revalidation reconciles the canonical value.
                        assignee: value ? { name: label || value } : null,
                    };
                if (action === 'due') return { ...task, dueAt: value || null };
                return task;
            });
            return { rows, truncated: current?.truncated ?? false };
        },
    });

    // BulkActionBar.onApply — fire the bulk mutation; the bar clears its own
    // form once `applying` settles.
    const handleBulkApply = (action: string, value: string, label: string) => {
        if (!action || selected.size === 0) return;
        bulkMutation
            .trigger({ action, value, label, ids: Array.from(selected) })
            .catch(() => {
                /* rollback already applied by the hook */
            })
            .finally(() => {
                // Mirror the prior `onSettled` semantics — clear selection +
                // fan out invalidation to sibling filter variants.
                invalidateAllTasks();
                setSelected(new Set());
            });
    };

    // Canonical bulk actions for the Tasks table — Assign (people-picker),
    // Change Status (active transitions), Set Due Date.
    const taskBulkActions: BulkActionDef[] = useMemo(
        () => [
            {
                value: 'assign',
                label: 'Assign',
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
                        placeholder="Assignee (blank = unassign)"
                        className="w-full sm:w-44"
                        id="bulk-value-input"
                    />
                ),
            },
            {
                value: 'status',
                label: 'Change Status',
                canApply: (v) => v !== '',
                renderInput: ({ value, setValue }) => (
                    <Combobox
                        hideSearch
                        id="bulk-value-input"
                        selected={
                            BULK_STATUS_CB_OPTIONS.find((o) => o.value === value) ??
                            null
                        }
                        setSelected={(opt) => setValue(opt?.value ?? '')}
                        options={BULK_STATUS_CB_OPTIONS}
                        placeholder="Select status..."
                        matchTriggerWidth
                        buttonProps={{ className: 'text-sm' }}
                    />
                ),
            },
            {
                value: 'due',
                label: 'Set Due Date',
                renderInput: ({ value, setValue }) => (
                    <DatePicker
                        id="bulk-value-input"
                        className="w-full sm:w-40 text-sm"
                        placeholder="Due date"
                        clearable
                        align="start"
                        value={parseYMD(value)}
                        onChange={(next) => setValue(toYMD(next) ?? '')}
                        disabledDays={{ before: startOfUtcDay(new Date()) }}
                        aria-label="Bulk due date"
                    />
                ),
            },
            { value: 'delete', label: 'Delete', confirm: true },
        ],
        [tenantSlug],
    );

    // R10-PR7 — column-visibility gear.
    const taskColumnList = useMemo(
        () => [
            { id: 'title', label: 'Title' },
            { id: 'type', label: 'Type' },
            { id: 'severity', label: 'Severity' },
            { id: 'status', label: 'Status' },
            { id: 'assignee', label: 'Assignee' },
            { id: 'dueAt', label: 'Due' },
            { id: 'updatedAt', label: 'Updated', defaultVisible: false },
        ],
        [],
    );
    const {
        columnVisibility,
        setColumnVisibility,
        dropdown: columnsDropdown,
        orderColumns,
    } = useColumnsDropdown({
        storageKey: 'inflect:col-vis:tasks',
        columns: taskColumnList,
    });

    // ── Column definitions ──
    // R12-PR1 — the custom square-checkbox `id: 'select'` column was
    // replaced by DataTable's built-in circular select column.
    // DataTable's selection is wired to the same local `selected` Set
    // via `onRowSelectionChange` so the bulk-action toolbar still
    // reads from `selected.size` / `selected.has(...)`.
    const taskColumns = useMemo(() => {
        const cols: ReturnType<typeof createColumns<TaskListItem>> = [];

        cols.push(
            {
                id: 'title',
                header: 'Title',
                accessorFn: (t) => t.title,
                // R13-PR1 — title cell uses the canonical
                // <TableTitleCell> primitive. The key prefix, Overdue
                // badge, and SLA tooltip that used to live inline here
                // pushed row height past every other page's baseline.
                // Status-tone signals are already in the dedicated
                // Status + Severity columns; key prefix can land in a
                // separate column in a follow-up.
                // Single-click the TITLE opens the quick-view side panel (a
                // <button>, so the table's isClickOnInteractiveChild() skips
                // the row's select/navigate handlers). Row double-click still
                // navigates to the full detail page.
                cell: ({ row }) => (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(row.original);
                        }}
                        className="inline-block max-w-full cursor-pointer truncate text-left align-middle rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        id={`task-link-${row.original.id}`}
                        data-testid={`task-title-${row.original.id}`}
                    >
                        <TableTitleCell tintOn="self">{row.original.title}</TableTitleCell>
                    </button>
                ),
            },
            {
                accessorKey: 'type',
                header: 'Type',
                cell: ({ getValue }) => <span className="text-xs text-content-muted">{TYPE_LABELS[getValue<string>()] || getValue<string>()}</span>,
            },
            {
                accessorKey: 'severity',
                header: 'Severity',
                cell: ({ row }) => (
                    <StatusBadge variant={SEVERITY_BADGE[row.original.severity] || 'neutral'} size="sm">
                        {row.original.severity}
                    </StatusBadge>
                ),
            },
            {
                accessorKey: 'status',
                header: 'Status',
                cell: ({ row }) => (
                    <StatusBadge variant={STATUS_BADGE[row.original.status] || 'neutral'} size="sm">
                        {STATUS_LABELS[row.original.status] || row.original.status}
                    </StatusBadge>
                ),
            },
            {
                id: 'assignee',
                header: 'Assignee',
                accessorFn: (t) => t.assignee?.name || '—',
                cell: ({ getValue }) => <span className="text-xs text-content-muted">{getValue<string>()}</span>,
            },
            {
                id: 'dueAt',
                header: 'Due Date',
                cell: ({ row }) => (
                    <TimestampTooltip
                        date={row.original.dueAt}
                        className="text-xs text-content-muted"
                    />
                ),
            },
            {
                id: 'updatedAt',
                header: 'Updated',
                cell: ({ row }) => (
                    <TimestampTooltip
                        date={row.original.updatedAt}
                        className="text-xs text-content-muted"
                    />
                ),
            },
        );

        // Quick-edit affordance — opens the row's task in the non-modal
        // quick-view side panel (same target as a title click). Gated on
        // edit permission; `stopPropagation` so it doesn't also fire the
        // row's navigate-to-detail click.
        if (appPermissions.tasks.edit) {
            cols.push({
                id: 'quick-edit',
                header: '',
                enableHiding: false,
                cell: ({ row }) => (
                    <button
                        type="button"
                        aria-label="Edit task"
                        className="inline-flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-bg-muted hover:text-content-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        data-testid={`task-quick-edit-${row.original.id}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            setSelectedTask(row.original);
                        }}
                    >
                        <AppIcon name="edit" size={14} />
                    </button>
                ),
            });
        }

        return cols;

    }, [appPermissions.tasks.edit, selected, tasks.length, tenantHref, hydratedNow]);

    // Quick-view side panel. Keyed by task id so switching to another task
    // forces a fresh mount → openOnMount re-fires and TaskEditPanel re-seeds
    // from the newly-clicked row (it seeds form state on mount only). The
    // panel re-fetches full detail via GET /tasks/{id}, so a minimal seed
    // object is enough.
    const taskQuickViewAside = selectedTask ? (
        <AsidePanel
            key={`qv-task-${selectedTask.id}`}
            title="Task"
            surfaceKey="tasks-quickview"
            // A wide dedicated PANEL for the tabbed editor — not the narrow
            // browse/assist rail width.
            defaultWidth={520}
            openOnMount
            onClose={() => setSelectedTask(null)}
        >
            <TaskEditPanel
                tenantSlug={tenantSlug}
                task={{
                    id: selectedTask.id,
                    title: selectedTask.title,
                    status: selectedTask.status,
                    severity: selectedTask.severity,
                    key: selectedTask.key ?? undefined,
                }}
                canWrite={appPermissions.tasks.edit}
                onClose={() => setSelectedTask(null)}
                onSaved={() => void invalidateAllTasks()}
            />
        </AsidePanel>
    ) : null;

    return (
        <ListPageShell className="animate-fadeIn gap-section" data-hydrated={hydrated || undefined}>
            <ListPageShell.Header>
                {/* Header action cluster is intentionally empty — the
                    create button moved into the FilterToolbar leading slot
                    and the Dashboard nav icon into the toolbar actions slot
                    (left of the gears). */}
                <div>
                    <PageBreadcrumbs
                        items={[
                            { label: 'Dashboard', href: tenantHref('/dashboard') },
                            { label: 'Tasks' },
                        ]}
                        className="mb-1"
                    />
                    <Heading level={1}>Tasks</Heading>
                    <p className="text-sm text-content-muted mt-1">
                        Compliance work prioritised, assigned, and tracked to closure.
                    </p>
                </div>
            </ListPageShell.Header>

            <ListPageShell.Filters className="space-y-section">
                {/* R23-PR-E — KPI strip. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                    <KpiFilterCard
                        label="Total tasks"
                        value={totalTasks}
                        sparkline={taskTrends.total}
                        sparklineVariant={sparkColors.total}
                        sparklineDomain={centeredSparklineDomain(taskTrends.total)}
                        onClick={() => toggleTaskKpi('total')}
                        selected={activeTaskKpi === 'total'}
                    />
                    <KpiFilterCard
                        label="Open"
                        value={openTasks}
                        tone="attention"
                        sparkline={taskTrends.open}
                        sparklineVariant={sparkColors.open}
                        sparklineDomain={centeredSparklineDomain(taskTrends.open)}
                        onClick={() => toggleTaskKpi('open')}
                        selected={activeTaskKpi === 'open'}
                    />
                    <KpiFilterCard
                        label="Overdue"
                        value={overdueTasks}
                        tone={overdueTasks > 0 ? 'critical' : 'default'}
                        sparkline={taskTrends.overdue}
                        sparklineVariant={sparkColors.overdue}
                        sparklineDomain={centeredSparklineDomain(taskTrends.overdue)}
                        onClick={() => toggleTaskKpi('overdue')}
                        selected={activeTaskKpi === 'overdue'}
                    />
                    <KpiFilterCard
                        label="Due this week"
                        value={dueWeekTasks}
                        tone="attention"
                        sparkline={taskTrends.dueWeek}
                        sparklineVariant={sparkColors.dueWeek}
                        sparklineDomain={centeredSparklineDomain(taskTrends.dueWeek)}
                        onClick={() => toggleTaskKpi('dueWeek')}
                        selected={activeTaskKpi === 'dueWeek'}
                    />
                </div>
                <FilterToolbar
                    filters={visibleFilterDefs}
                    searchId="tasks-search"
                    searchPlaceholder="Search tasks…"
                    leading={appPermissions.tasks.create ? (
                        <Button
                            variant="primary"
                            icon={<Plus className="-ml-0.5 -mr-2.5" />}
                            onClick={() => setIsCreateOpen(true)}
                            id="new-task-btn"
                        >
                            Task
                        </Button>
                    ) : undefined}
                    actions={
                        <>
                            <Tooltip content="Dashboard">
                                <Link href={tenantHref('/tasks/dashboard')} aria-label="Dashboard" className={buttonVariants({ variant: 'secondary', size: 'icon' })} id="dashboard-btn"><AppIcon name="dashboard" size={16} /></Link>
                            </Tooltip>
                            {columnsDropdown}
                            {filtersDropdown}
                        </>
                    }
                />
            </ListPageShell.Filters>

            {/* B1 (2026-06-07): the bulk-edit form moved INTO the
                DataTable's header-row selection toolbar (`selectionControls`
                below) — it pops over the column-names row on row-select.
                The toolbar owns the count + Clear; the form keeps only
                action + value + Apply. */}

            <ListPageShell.Body aside={taskQuickViewAside}>
                <TruncationBanner truncated={truncated} />
                <DataTable<TaskListItem>
                    fillBody
                    onReachEnd={hasMoreTasks ? loadMoreTasks : undefined}
                    data={visibleTasks}
                    columns={orderColumns(taskColumns)}
                    loading={loading}
                    getRowId={(t) => t.id}
                    sortableColumns={sortableColumns}
                    sortBy={sortBy}
                    sortOrder={sortOrder}
                    onSortChange={({ sortBy: nextBy, sortOrder: nextOrder }) => {
                        setSortBy(nextBy);
                        setSortOrder(nextOrder);
                    }}
                    columnVisibility={columnVisibility}
                    onColumnVisibilityChange={setColumnVisibility}
                    selectionEnabled={appPermissions.tasks.edit}
                    selectedRows={Object.fromEntries(
                        Array.from(selected).map((id) => [id, true]),
                    )}
                    onRowSelectionChange={(rows) =>
                        setSelected(new Set(rows.map((r) => r.original.id)))
                    }
                    selectionControls={() => (
                        <BulkActionBar
                            actions={taskBulkActions}
                            onApply={handleBulkApply}
                            applying={bulkMutation.isMutating}
                            selectedCount={selected.size}
                            entityLabel="tasks"
                        />
                    )}
                    onRowClick={(row) => router.push(tenantHref(`/tasks/${row.original.id}`))}
                    onRowPrefetch={(row) => router.prefetch(tenantHref(`/tasks/${row.original.id}`))}
                    emptyState={
                        hasActive ? (
                            <EmptyState
                                size="sm"
                                variant="no-results"
                                title="No tasks match your filters"
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
                                title="No tasks yet"
                                description="Tasks track remediation work — anything that turns a finding or open risk into a closed loop."
                            />
                        )
                    }
                    resourceName={(p) => p ? 'tasks' : 'task'}
                    data-testid="tasks-table"
                    className="hover:bg-bg-muted"
                />
            </ListPageShell.Body>

            {appPermissions.tasks.create && (
                <NewTaskModal open={isCreateOpen} setOpen={setIsCreateOpen} />
            )}
        </ListPageShell>
    );
}
