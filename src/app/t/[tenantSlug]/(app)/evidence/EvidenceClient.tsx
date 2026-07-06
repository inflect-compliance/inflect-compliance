'use client';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useMemo, useCallback } from 'react';
import { useSWRConfig } from 'swr';
import { useTenantSWR, usePrefetchTenant } from '@/lib/hooks/use-tenant-swr';
import { useKpiTrends, buildKpiSparklines, buildKpiSparklineNullable, centeredSparklineDomain, assignSparklineVariants } from '@/lib/charts/kpi-trends';
import { BulkActionBar, type BulkActionDef } from '@/components/ui/bulk-action-bar';
import { UserCombobox } from '@/components/ui/user-combobox';
import { ownerDisplayName } from '@/lib/owner-display';
import { useTenantMutation } from '@/lib/hooks/use-tenant-mutation';
import { CACHE_KEYS } from '@/lib/swr-keys';
import type { CappedList } from '@/lib/list-backfill-cap';
import { TruncationBanner } from '@/components/ui/TruncationBanner';
import { useUrlFilters } from '@/lib/hooks/useUrlFilters';
import { useHydratedNow } from '@/lib/hooks/use-hydrated-now';
// Both evidence modals were previously lazy-loaded via next/dynamic,
// but the JIT race in `next dev` made the modals occasionally fail to
// mount in serial-mode E2E runs (Playwright clicked the trigger before
// the chunk finished compiling). Static imports — the bundle cost is
// acceptable and the E2E suite becomes deterministic.
import { UploadEvidenceModal } from './UploadEvidenceModal';
import { EvidenceDetailSheet } from './EvidenceDetailSheet';
import { EditEvidenceModal } from './EditEvidenceModal';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import {
    DataTable,
    createColumns,
    useColumnsDropdown,
    sortRowsByDisplay,
    type SortAccessors,
} from '@/components/ui/table';
import { Tooltip } from '@/components/ui/tooltip';
import {
    FilterProvider,
    useFilterContext,
    useFilters,
    useFilterCardVisibility,
    filtersToCards,
    selectVisibleFilters,
    type FilterType,
} from '@/components/ui/filter';
import { FilterToolbar } from '@/components/filters/FilterToolbar';
import { ListPageShell } from '@/components/layout/ListPageShell';
import { useThresholdLoadMore } from '@/components/ui/hooks';
import { KpiFilterCard } from '@/components/ui/kpi-filter-card';
import { useKpiFilter, type KpiFilterDef } from '@/components/ui/kpi-filter';
import {
    resolveFileTypeIcon,
} from '@/components/ui/file-type-icon';
import { FreshnessBadge } from '@/components/ui/FreshnessBadge';
import { EvidenceGallery } from '@/components/ui/EvidenceGallery';
import { TimestampTooltip } from '@/components/ui/timestamp-tooltip';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { InlineNotice } from '@/components/ui/inline-notice';
import { useCelebration } from '@/components/ui/hooks';
import { MILESTONES } from '@/lib/celebrations';
import { isAllEvidenceCurrent } from '@/lib/evidence-freshness';
import { toApiSearchParams } from '@/lib/filters/url-sync';
import {
    buildEvidenceFilters,
    EVIDENCE_FILTER_KEYS,
} from './filter-defs';
import { Heading } from '@/components/ui/typography';
import { PageBreadcrumbs } from '@/components/layout/PageBreadcrumbs';
import { Plus, Pen2, Download, BoxArchive, PaperPlane, Check, Xmark } from '@/components/ui/icons/nucleo';

interface Permissions {
    canRead: boolean;
    canWrite: boolean;
    canAdmin: boolean;
    canAudit: boolean;
    canExport: boolean;
}

const STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    DRAFT: 'neutral', SUBMITTED: 'info', APPROVED: 'success', REJECTED: 'error',
    PENDING_UPLOAD: 'info',
};

// Shared icon-only action button (Edit / Archive / Download columns) —
// mirrors the control-table quick-edit affordance.
const ICON_ACTION_CLASS =
    'inline-flex h-7 w-7 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-bg-muted hover:text-content-emphasis focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

type RetentionFilter = 'active' | 'expiring' | 'archived';


type Tx = (key: string, values?: Record<string, string | number>) => string;

function getRetentionStatus(ev: EvidenceRow, now: Date | null, tx: Tx): { label: string; badge: StatusBadgeVariant; icon: string } {
    if (ev.isArchived) return { label: tx('list.retentionArchived'), badge: 'neutral', icon: '' };
    if (ev.expiredAt) return { label: tx('list.retentionExpired'), badge: 'error', icon: '' };
    if (ev.retentionUntil) {
        if (!now) return { label: tx('list.retentionActive'), badge: 'success', icon: '' };
        const until = new Date(ev.retentionUntil);
        const daysLeft = Math.ceil((until.getTime() - now.getTime()) / 86_400_000);
        if (daysLeft <= 0) return { label: tx('list.retentionExpired'), badge: 'error', icon: '' };
        if (daysLeft <= 30) return { label: tx('list.retentionExpiring', { days: daysLeft }), badge: 'warning', icon: '' };
        return { label: tx('list.retentionActive'), badge: 'success', icon: '' };
    }
    return { label: tx('list.retentionNoPolicy'), badge: 'neutral', icon: '—' };
}

// listEvidence → EvidenceRepository.list (evidenceListSelect). Cell/accessor/
// filter callbacks stay untyped (file-level disable above — the colon-any
// category); this types the query payload, mutation cache + column factory.
interface EvidenceRow {
    id: string;
    title: string;
    type: string;
    status: string;
    fileName: string | null;
    owner: string | null;
    ownerUserId: string | null;
    folder: string | null;
    isArchived: boolean;
    expiredAt: string | null;
    deletedAt: string | null;
    retentionUntil: string | null;
    updatedAt: string;
    dateCollected: string;
    fileRecordId: string | null;
    content: string | null;
    control: { id: string; name: string; annexId: string | null } | null;
    fileRecord: { id: string; mimeType: string | null } | null;
}

// Minimal control shape this page consumes (filter builder + upload modal).
// Sourced from controlListSelect; nullable to match the serialized payload.
interface EvidenceControlOption {
    id: string;
    name: string;
    code: string | null;
    annexId: string | null;
}

interface EvidenceClientProps {

    initialEvidence: EvidenceRow[];

    initialControls: EvidenceControlOption[];
    tenantSlug: string;
    permissions: Permissions;
    translations: Record<string, string>;
}

/**
 * Client island for evidence — handles all interactive features.
 * Data arrives pre-fetched from the server component, hydrated into React Query.
 *
 * Filter architecture (Epic 53):
 *   - `q`, `type`, `status`, `controlId` flow through `useFilterContext`
 *     (URL-synced via the shared context).
 *   - `tab` (retention view: active | expiring | archived) stays on
 *     `useUrlFilters` since it's a view selector, not a filter.
 */
export function EvidenceClient(props: EvidenceClientProps) {
    const filterCtx = useFilterContext([], EVIDENCE_FILTER_KEYS, {});
    return (
        <FilterProvider value={filterCtx}>
            <EvidencePageInner {...props} />
        </FilterProvider>
    );
}

function EvidencePageInner({ initialEvidence, initialControls, tenantSlug, permissions, translations: t }: EvidenceClientProps) {
    // `tx` — next-intl for the strings not threaded via the server
    // `translations` prop (retention labels, bulk actions, KPI labels,
    // empty states, tooltips, toasts, …). The prop `t` stays intact.
    const tx = useTranslations('evidence');
    const tGroup = useTranslations('common.filterGroups');
    // Stabilise across renders so dependent useCallbacks don't get a
    // fresh identity every cycle (was a real exhaustive-deps warning).
    const apiUrl = useCallback(
        (path: string) => `/api/t/${tenantSlug}${path}`,
        [tenantSlug],
    );
    const { mutate: swrMutate } = useSWRConfig();

    // Retention-tab + view-mode selectors — deliberately kept separate from filter state.
    // `tab`: active | expiring | archived. `view`: list | gallery.
    // Both URL-synced so a refresh / back-button preserves the page
    // shape, and toggling the view doesn't clobber the active filters
    // (filter state lives in `filterCtx`, not in `useUrlFilters`).
    const { filters, setFilter } = useUrlFilters(['tab', 'view']);
    const filterCtx = useFilters();
    const { state, search, hasActive } = filterCtx;

    // ─── Build the API query string from filter state + retention tab ───
    const fetchParams = useMemo(() => {
        const params = toApiSearchParams(state, { search });
        if (filters.tab === 'archived') params.set('archived', 'true');
        else if (filters.tab === 'expiring') params.set('expiring', 'true');
        return params;
    }, [state, search, filters.tab]);

    // ─── Epic 69 — SWR-first read for the evidence list ───
    //
    // Each filter combo gets its own cache entry via the
    // query-string suffix on the SWR key. The unfiltered baseline
    // is the registry's `list()`. Server-rendered initialEvidence
    // lands as `fallbackData` only when no filters / retention tab
    // is active — otherwise the hook fires a fresh request, mirroring
    // the prior "skip initialData when filters diverge" semantics.
    const anyFilterActive = hasActive || !!filters.tab;
    const evidenceKey = useMemo(() => {
        const qs = fetchParams.toString();
        return qs
            ? `${CACHE_KEYS.evidence.list()}?${qs}`
            : CACHE_KEYS.evidence.list();
    }, [fetchParams]);


    // PR-5 — API returns `{ rows, truncated }`; the Client pulls
    // `rows` for the table and `truncated` for the banner. SSR
    // initial wraps with `truncated: false` (cap is 5000, SSR cap is
    // 100, so the SSR slice never trips truncation by itself).
    // PR-5 — warm the detail-sheet data on row hover. Unlike the route-based
    // lists (controls/risks/…) the evidence "drill-in" is a client-side Sheet,
    // not a navigation — so there is no RSC route to prefetch, only the
    // `EvidenceDetailSheet`'s `useTenantSWR(CACHE_KEYS.evidence.detail(id))`
    // read to pre-populate. Warming it on hover means the sheet opens with the
    // record already in cache instead of flashing its loading state.
    const prefetchData = usePrefetchTenant();
    const evidenceQuery = useTenantSWR<CappedList<EvidenceRow>>(evidenceKey, {
        fallbackData: anyFilterActive
            ? undefined
            : { rows: initialEvidence, truncated: false },
    });
    const truncated = evidenceQuery.data?.truncated ?? false;

    // ─── Bulk actions (canonical BulkActionBar) ───
    // Approve, Assign owner, Delete. Bulk Approve moves items straight to
    // APPROVED — the separate reviewer-identity review chain is bypassed for
    // this action (see bulkApproveEvidence).
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [bulkApplying, setBulkApplying] = useState(false);
    const handleBulkApply = async (action: string, value: string) => {
        const ids = Array.from(selected);
        if (ids.length === 0 || !['assign', 'delete', 'approve'].includes(action)) return;
        setBulkApplying(true);
        try {
            const url =
                action === 'delete' ? apiUrl('/evidence/bulk/delete')
                : action === 'approve' ? apiUrl('/evidence/bulk/approve')
                : apiUrl('/evidence/bulk/assign');
            const body =
                action === 'assign'
                    ? { evidenceIds: ids, ownerUserId: value || null }
                    : { evidenceIds: ids };
            const res = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            if (!res.ok) throw new Error(tx('list.bulkFailed'));
            await evidenceQuery.mutate();
            setSelected(new Set());
        } finally {
            setBulkApplying(false);
        }
    };
    const evidenceBulkActions: BulkActionDef[] = useMemo(
        () => [
            {
                value: 'approve',
                label: tx('list.bulkApprove'),
                confirm: {
                    tone: 'info',
                    confirmLabel: tx('list.bulkApproveConfirm'),
                    description: tx('list.bulkApproveDesc'),
                },
            },
            {
                value: 'assign',
                label: tx('list.bulkAssign'),
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
                        placeholder={tx('list.bulkAssignPlaceholder')}
                        className="w-full sm:w-44"
                        id="bulk-value-input"
                    />
                ),
            },
            { value: 'delete', label: tx('list.bulkDelete'), confirm: true },
        ],
        [tenantSlug, tx],
    );

    // Stabilise the array identity across renders so dependent hooks
    // (`useEffect` at line ~330 reads `evidence`) don't re-fire on
    // every render. Without the `useMemo` the `?? []` produces a new
    // empty array instance every cycle.

    const evidence: EvidenceRow[] = useMemo(
        () => evidenceQuery.data?.rows ?? [],
        [evidenceQuery.data],
    );

    const [controls] = useState<EvidenceControlOption[]>(initialControls);
    const retentionFilter = (filters.tab || 'active') as RetentionFilter;
    const { celebrate } = useCelebration();
    const viewMode: 'list' | 'gallery' =
        filters.view === 'gallery' ? 'gallery' : 'list';
    const [showUpload, setShowUpload] = useState(false);

    // B5 — row-click detail sheet + edit modal.
    const [detailSheetOpen, setDetailSheetOpen] = useState(false);
    const [detailEvidenceId, setDetailEvidenceId] = useState<string | null>(null);
    const [editModalOpen, setEditModalOpen] = useState(false);
    const [editInitial, setEditInitial] = useState<{
        id: string;
        title: string;
        description: string | null;
        ownerUserId: string | null;
        controlId: string | null;
        // B8 follow-up — folder is editable in the modal; threaded
        // through here so the modal seeds the input with the
        // current value.
        folder: string | null;
        // Retention date is now edited in the modal too (was inline).
        retentionUntil: string | null;
    } | null>(null);

    // Invalidate every cached evidence-list filter variant. SWR's
    // function-form `mutate()` matches by absolute URL prefix —
    // every key under `/api/t/{slug}/evidence` (with or without
    // query string) gets a background refetch.
    // Matches every cached evidence-list filter variant (the base URL
    // and any `?…` query-string sibling).
    const evidenceKeyMatcher = useCallback(
        (key: unknown): key is string => {
            const prefix = apiUrl(CACHE_KEYS.evidence.list());
            return (
                typeof key === 'string' &&
                (key === prefix || key.startsWith(`${prefix}?`))
            );
        },
        [apiUrl],
    );

    const invalidateEvidence = useCallback(
        () => swrMutate(evidenceKeyMatcher, undefined, { revalidate: true }),
        [swrMutate, evidenceKeyMatcher],
    );

    // Optimistically flip `isArchived` on the matching row across every
    // cached list variant, WITHOUT revalidating — so the row reacts
    // (e.g. drops out of the Active tab) the instant the button is
    // clicked, independent of refetch timing.
    const optimisticSetArchived = useCallback(
        (id: string, isArchived: boolean) =>
            swrMutate(
                evidenceKeyMatcher,
                (
                    current?: {
                        rows?: Record<string, unknown>[];
                        truncated?: boolean;
                    },
                ) =>
                    current
                        ? {
                              ...current,
                              rows: (current.rows ?? []).map((r) =>
                                  r.id === id ? { ...r, isArchived } : r,
                              ),
                          }
                        : current,
                { revalidate: false },
            ),
        [swrMutate, evidenceKeyMatcher],
    );

    // ─── Mutation: review workflow (Epic 69 — useTenantMutation) ───
    //
    // Migrated from React Query's `useMutation` + `onMutate` /
    // `onError` rollback hooks. The optimistic update flips the
    // matching row's status synchronously; SWR's `rollbackOnError`
    // default restores the prior list on failure. After success
    // SWR revalidates the current key, and `invalidateEvidence()`
    // fans out to sibling filter variants.
    // PR-5 — cache value is `CappedList<EvidenceRow>` (the API returns
    // `{ rows, truncated }`); preserve `truncated` and only rewrite `rows`.
    const reviewMutation = useTenantMutation<CappedList<EvidenceRow>, { id: string; action: string; comment: string }, unknown>({
        key: evidenceKey,
        mutationFn: async ({ id, action, comment }) => {
            const res = await fetch(apiUrl(`/evidence/${id}/review`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action, comment }),
            });
            if (!res.ok) throw new Error(tx('list.reviewFailed'));
            return res.json().catch(() => null);
        },
        optimisticUpdate: (current, { id, action }) => {
            const newStatus =
                action === 'SUBMITTED'
                    ? 'SUBMITTED'
                    : action === 'APPROVED'
                        ? 'APPROVED'
                        : 'REJECTED';
            const rows = (current?.rows ?? []).map((ev) =>
                ev.id === id ? { ...ev, status: newStatus } : ev,
            );
            return { rows, truncated: current?.truncated ?? false };
        },
    });

    const submitReview = (id: string, action: string, comment = '') => {
        reviewMutation.trigger({ id, action, comment }).catch(() => {
            /* rollback already applied by the hook */
        }).finally(() => {
            // Fan out to sibling filter variants for completeness —
            // status flips affect the "approved-only" / "rejected-
            // only" filter views which the primary key revalidation
            // doesn't cover.
            invalidateEvidence();
        });
    };

    // ─── Retention actions ─────────────────────────────────────────

    // Shared archive/unarchive runner. Optimistically flips the row,
    // POSTs, then revalidates from the server on either outcome. The
    // try/catch is load-bearing: the row buttons call this from a
    // non-awaited `onClick`, so a thrown fetch (offline / blocked /
    // network) would otherwise reject silently and the click would
    // appear to "do nothing". Any failure now rolls back + alerts.
    const setArchived = async (id: string, isArchived: boolean) => {
        const verb = isArchived ? 'archive' : 'unarchive';
        await optimisticSetArchived(id, isArchived);
        try {
            const res = await fetch(apiUrl(`/evidence/${id}/${verb}`), {
                method: 'POST',
            });
            if (!res.ok) {
                const err = await res.json().catch(() => null);
                throw new Error(
                    err?.error?.message ||
                        (isArchived
                            ? tx('list.archiveFailedStatus', { status: res.status })
                            : tx('list.unarchiveFailedStatus', { status: res.status })),
                );
            }
            await invalidateEvidence();
        } catch (e) {
            await invalidateEvidence(); // roll back to server truth
            alert(e instanceof Error ? e.message : (isArchived ? tx('list.archiveFailedNet') : tx('list.unarchiveFailedNet')));
        }
    };

    const archiveEvidence = (id: string) => setArchived(id, true);
    const unarchiveEvidence = (id: string) => setArchived(id, false);

    const statusLabel = (status: string) => {
        const map: Record<string, string> = { DRAFT: t.draft, SUBMITTED: t.submitted, APPROVED: t.approved, REJECTED: t.rejected, PENDING_UPLOAD: tx('list.uploading') };
        return map[status] || status;
    };

    // ─── Retention filter counts ───
    // Null on SSR + first client render so the "Expiring" count matches
    // exactly across hydration (avoids React #418/#422).
    const hydratedNow = useHydratedNow();

    // ─── R23-PR-E — KPI definitions for the Evidence page ───
    // Status-based buckets aligned to the existing `status` filter
    // (DRAFT/SUBMITTED/APPROVED/REJECTED). The retention tabs
    // (Active/Expiring/Archived) are a separate dimension owned by
    // the tab-bar above the filter toolbar — KPIs cover status only
    // so the two affordances stay independent.
    type EvidenceKpiId = 'total' | 'draft' | 'submitted' | 'approved';
    // guardrail-ignore: KPI counts across the loaded page, not a refilter.
    const totalEvidence = evidence.length;

    // Canonical KPI-card sparklines (shared hook). `total` is an always-present
    // series; the status buckets (draft/submitted/approved) are forward-only
    // nullable columns — empty until history accrues, never a fake ramp.
    const trendsQuery = useKpiTrends(tenantSlug);
    const evidenceTrends = useMemo(() => {
        const points = trendsQuery.data?.dataPoints;
        return {
            total: buildKpiSparklines(points, (d) => d.evidenceTotal, {
                total: (d) => d.evidenceTotal,
            }).total,
            draft: buildKpiSparklineNullable(points, (d) => d.evidenceDraft),
            submitted: buildKpiSparklineNullable(points, (d) => d.evidenceSubmitted),
            approved: buildKpiSparklineNullable(points, (d) => d.evidenceApproved),
        };
    }, [trendsQuery.data]);
    // Distinct sparkline colour per card (canonical allocator) — no two cards
    // on the row share a colour. Memo on [] so the random allocation is stable
    // for this page view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const sparkColors = useMemo(
        () => assignSparklineVariants(['total', 'draft', 'submitted', 'approved']),
        [],
    );
    // guardrail-ignore: KPI count, not a refilter.
    const draftEvidence = evidence.filter((ev) => ev.status === 'DRAFT').length;
    // guardrail-ignore: KPI count, not a refilter.
    const submittedEvidence = evidence.filter((ev) => ev.status === 'SUBMITTED').length;
    // guardrail-ignore: KPI count, not a refilter.
    const approvedEvidence = evidence.filter((ev) => ev.status === 'APPROVED').length;
    const evidenceKpiDefs: ReadonlyArray<KpiFilterDef<EvidenceKpiId>> = useMemo(
        () => [
            {
                id: 'total',
                apply: (ctx) => ctx.clearAll(),
                isActive: (s) => Object.keys(s).length === 0,
            },
            {
                id: 'draft',
                apply: (ctx) => ctx.set('status', 'DRAFT'),
                isActive: (s) => (s.status ?? []).includes('DRAFT'),
                clear: (ctx) => ctx.removeAll('status'),
            },
            {
                id: 'submitted',
                apply: (ctx) => ctx.set('status', 'SUBMITTED'),
                isActive: (s) => (s.status ?? []).includes('SUBMITTED'),
                clear: (ctx) => ctx.removeAll('status'),
            },
            {
                id: 'approved',
                apply: (ctx) => ctx.set('status', 'APPROVED'),
                isActive: (s) => (s.status ?? []).includes('APPROVED'),
                clear: (ctx) => ctx.removeAll('status'),
            },
        ],
        [],
    );
    const { activeKpiId: activeEvidenceKpi, toggle: toggleEvidenceKpi } =
        useKpiFilter(evidenceKpiDefs);

    const activeEvidence = evidence.filter(ev => !ev.isArchived && !ev.expiredAt && !ev.deletedAt);
    const expiringEvidence = hydratedNow ? evidence.filter(ev => {
        if (ev.isArchived || ev.deletedAt) return false;
        if (!ev.retentionUntil) return false;
        const until = new Date(ev.retentionUntil);
        const in30Days = new Date(hydratedNow.getTime() + 30 * 86_400_000);
        return until <= in30Days && until > hydratedNow;
    }) : [];
    const archivedEvidence = evidence.filter(ev => ev.isArchived || ev.expiredAt);

    // ─── Filtered evidence list (respects the active retention tab) ───
    const displayEvidence = retentionFilter === 'archived'
        ? archivedEvidence
        : retentionFilter === 'expiring'
            ? expiringEvidence
            : activeEvidence;

    // ─── PR-1: org-parity sortable headers + progressive disclosure ───
    const [sortBy, setSortBy] = useState<string | undefined>(undefined);
    const [sortOrder, setSortOrder] = useState<'asc' | 'desc' | undefined>(
        undefined,
    );
    // Sort accessors return the value each column DISPLAYS, so sorting groups
    // same-displayed-value rows contiguously. Several columns render a DERIVED
    // label, not a raw field — the old comparator sorted by the raw field and
    // so failed to group rows that look identical:
    //   - `type`      → the cell shows resolveFileTypeIcon(...).label (PDF /
    //                   Image / Link), not the raw `ev.type` enum.
    //   - `control`   → the cell shows "{annexId} {name}", not just annexId.
    //   - `retention` → the cell shows getRetentionStatus(...).label
    //                   (Active / Expiring / Expired), not the raw ISO date.
    //   - `status`    → the cell shows statusLabel(ev.status), not the enum.
    //   - `owner`     → the cell shows `ev.owner`, not `ev.ownerUser?.name`.
    // Each accessor below reuses the SAME derivation as its column cell.
    const sortAccessors = useMemo<SortAccessors<EvidenceRow>>(
        () => ({
            title: (ev) => ev.title || '',
            type: (ev) =>
                resolveFileTypeIcon(
                    ev.fileName ?? null,
                    ev.fileRecord?.mimeType ?? null,
                    ev.type ?? null,
                ).label,
            control: (ev) =>
                ev.control ? `${ev.control.annexId || ''} ${ev.control.name}` : '—',
            retention: (ev) => getRetentionStatus(ev, hydratedNow, tx).label,
            status: (ev) => statusLabel(ev.status),
            owner: (ev) => ev.owner || '—',
        }),
        // statusLabel closes over `t`; getRetentionStatus is pure of `hydratedNow`.
        [t, hydratedNow, tx],
    );
    const sortedEvidence = useMemo(
        () => sortRowsByDisplay(displayEvidence, sortAccessors, sortBy, sortOrder),
        [displayEvidence, sortAccessors, sortBy, sortOrder],
    );
    const sortableEvidenceColumns = useMemo(
        () => ['title', 'type', 'control', 'retention', 'status', 'owner'],
        [],
    );
    const {
        visibleRows: visibleEvidence,
        hasMore: hasMoreEvidence,
        loadMore: loadMoreEvidence,
    } = useThresholdLoadMore(sortedEvidence);

    // Epic 62 — celebrate when every active evidence row is fresh.
    // Gates that suppress false positives:
    //   - hydratedNow set (skips SSR / first-render race)
    //   - default 'active' retention tab + no other filters
    //   - query has actually loaded data at least once
    // Session dedupe in `useCelebration` prevents repeat fires across
    // refreshes / re-renders.
    useEffect(() => {
        if (!hydratedNow) return;
        if (retentionFilter !== 'active') return;
        if (anyFilterActive) return;
        if (evidenceQuery.isLoading) return;
        if (!isAllEvidenceCurrent(evidence, { now: hydratedNow })) return;
        const def = MILESTONES['evidence-all-current'];
        celebrate({
            preset: def.preset,
            key: def.key,
            message: def.message,
            description: def.description,
        });
    }, [
        evidence,
        hydratedNow,
        retentionFilter,
        anyFilterActive,
        evidenceQuery.isLoading,
        celebrate,
    ]);

    // ─── Column visibility (Epic 52 / R10-PR6) ───
    // Pagination removed — internal scroll inside the table card
    // (ListPageShell.Body + DataTable fillBody) shows all rows.
    const evidenceColumnList = useMemo(
        () => [
            { id: 'title', label: tx('colVis.title') },
            { id: 'type', label: tx('colVis.type') },
            { id: 'control', label: tx('colVis.control') },
            // B8 follow-up — Folder column. Hidden by default
            // (`defaultHidden: true` would be ideal but the dropdown
            // primitive doesn't carry that yet) — the user reveals
            // it via the gear once they start using folders.
            { id: 'folder', label: tx('colVis.folder') },
            { id: 'retention', label: tx('colVis.retention') },
            { id: 'freshness', label: tx('colVis.freshness') },
            { id: 'status', label: tx('colVis.status') },
            { id: 'owner', label: tx('colVis.owner') },
            { id: 'actions', label: tx('colVis.actions'), alwaysVisible: true },
        ],
        [tx],
    );
    const {
        columnVisibility,
        setColumnVisibility,
        orderColumns,
        dropdown: columnsDropdown,
    } = useColumnsDropdown({
        storageKey: 'inflect:col-vis:evidence',
        columns: evidenceColumnList,
    });

    // ─── Filter defs (FDEFS) + the "Edit filter cards" gear ───
    // Built in the parent (rather than inside EvidenceFilterToolbar) so
    // the filter gear can ride the same toolbar `actions` slot as the
    // columns gear. The FilterProvider state (keyed by
    // EVIDENCE_FILTER_KEYS) is untouched — a hidden filter keeps its value.
    const evidenceFilters: FilterType[] = useMemo(
        () =>
            buildEvidenceFilters(
                controls as Parameters<typeof buildEvidenceFilters>[0],
                evidence,
                (k, v) => tx(k as Parameters<typeof tx>[0], v as Parameters<typeof tx>[1]),
                (k) => tGroup(k as Parameters<typeof tGroup>[0]),
            ),
        [controls, evidence, tx, tGroup],
    );
    const filterCards = useMemo(
        () => filtersToCards(evidenceFilters),
        [evidenceFilters],
    );
    const { visibleCards, dropdown: filtersDropdown } = useFilterCardVisibility({
        storageKey: 'inflect:filter-vis:evidence',
        cards: filterCards,
    });
    const visibleFilterDefs = useMemo(
        () => selectVisibleFilters(visibleCards, evidenceFilters),
        [visibleCards, evidenceFilters],
    );

    // ── Evidence Column Definitions ──

    const evidenceColumns = useMemo(() => createColumns<EvidenceRow>([
        {
            accessorKey: 'title',
            header: t.evidenceTitle,
            // R13-PR1 — title cell uses the canonical <TableTitleCell>
            // primitive. The file-type icon + filename subtitle that
            // used to live here pushed the row height past every other
            // page's baseline. File type information is still in the
            // dedicated Type column.

            cell: ({ row }) => {
                // Evidence has no dedicated detail page yet — the record opens
                // via the master/detail pattern from this list page. The title
                // is truncated VISUALLY with a CSS ellipsis (the semantic
                // max-w-trunc-default token) — the FULL text stays in the DOM,
                // so accessibility, search, copy-paste,
                // and list assertions keep working; the full value also shows
                // on hover. (A prior JS substring truncated the DOM text itself,
                // which silently broke the evidence-list E2E specs that assert
                // the new row's full title appears.)
                const title = row.original.title;
                const truncated = !!title && title.length > 20;
                const inner = (
                    <TableTitleCell className="block max-w-trunc-default truncate">
                        {title}
                    </TableTitleCell>
                );
                return truncated ? (
                    <Tooltip content={title}>
                        <span className="inline-flex max-w-full min-w-0">{inner}</span>
                    </Tooltip>
                ) : (
                    inner
                );
            },
        },
        {
            accessorKey: 'type',
            header: t.type,

            cell: ({ row }) => {
                const ev = row.original;
                // Mixed-file aware: pick the actual file kind by
                // extension/MIME when this row is a file; fall back to
                // the domain kind (LINK / TEXT) for non-file rows.
                const match = resolveFileTypeIcon(
                    ev.fileName ?? null,
                    ev.fileRecord?.mimeType ?? null,
                    ev.type ?? null,
                );
                return (
                    <span
                        className="inline-flex items-center gap-1.5 text-xs text-content-muted"
                        data-file-kind={match.label.toLowerCase()}
                    >
                        <match.Icon
                            size={14}
                            className={match.colorClass}
                            aria-hidden
                        />
                        <span>{match.label}</span>
                    </span>
                );
            },
        },
        {
            id: 'control',
            header: t.control,

            accessorFn: (ev) => ev.control ? `${ev.control.annexId || ''} ${ev.control.name}` : '\u2014',
            cell: ({ getValue }: { getValue: () => string }) => (
                <span className="text-xs text-content-muted">{getValue()}</span>
            ),
        },
        {
            id: 'folder',
            header: tx('colHeaders.folder'),
            // B8 follow-up \u2014 the Folder column matches the
            // VendorDocsTable shape: empty/null = em-dash, otherwise
            // a muted tag. Hidden by default if a tenant has zero
            // foldered evidence \u2014 the column-visibility gear keeps
            // it discoverable.
            accessorFn: (ev: { folder?: string | null }) => ev.folder || '',
            cell: ({ row }: { row: { original: { folder?: string | null } } }) =>
                row.original.folder ? (
                    <span className="text-xs text-content-muted">
                        {row.original.folder}
                    </span>
                ) : (
                    <span className="text-content-subtle">—</span>
                ),
        },
        {
            id: 'retention',
            header: tx('colHeaders.retention'),

            cell: ({ row }) => {
                const ev = row.original;
                const rs = getRetentionStatus(ev, hydratedNow, tx);
                // Retention is now edited from the evidence Edit modal
                // (Edit icon → "Retention date"); the column is display-
                // only. Status badge + the resolved date.
                return (
                    <div className="text-xs">
                        <StatusBadge variant={rs.badge} id={`retention-status-${ev.id}`}>
                            {rs.icon} {rs.label}
                        </StatusBadge>
                        {ev.retentionUntil && !ev.isArchived && (
                            <TimestampTooltip
                                date={ev.retentionUntil}
                                className="text-content-subtle mt-0.5 block"
                                data-testid={`evidence-row-retention-date-${ev.id}`}
                            />
                        )}
                    </div>
                );
            },
            meta: { disableTruncate: true },
        },
        {
            id: 'freshness',
            header: tx('colHeaders.freshness'),

            cell: ({ row }) => {
                const ev = row.original;
                // `lastRefreshedAt` is not yet a discrete column on
                // Evidence — `updatedAt` is the closest existing
                // signal (any review action / metadata edit / archive
                // toggle bumps it). Wrapping it in the FreshnessBadge
                // here keeps the page semantic in sync with the
                // Epic 43 spec without forcing a schema migration.
                return (
                    <FreshnessBadge
                        lastRefreshedAt={ev.updatedAt ?? ev.dateCollected ?? null}
                        now={hydratedNow}
                        compact
                        data-testid={`evidence-row-freshness-${ev.id}`}
                    />
                );
            },
            meta: { disableTruncate: true },
        },
        {
            accessorKey: 'status',
            header: t.status,

            cell: ({ row }) => {
                const ev = row.original;
                return <StatusBadge variant={STATUS_BADGE[ev.status]}>{statusLabel(ev.status)}</StatusBadge>;
            },
        },
        {
            id: 'owner',
            header: t.ownerLabel,

            accessorFn: (ev) => ev.owner || '\u2014',
            cell: ({ getValue }: { getValue: () => string }) => (
                <span className="text-xs">{getValue()}</span>
            ),
        },
        // Edit — icon-only column (Control-table parity). Opens the
        // SAME EditEvidenceModal the detail side-sheet's edit icon does.
        {
            id: 'edit',
            header: '',
            enableHiding: false,
            cell: ({ row }) => {
                const ev = row.original;
                if (!permissions.canWrite || ev.id?.startsWith('temp:')) return null;
                return (
                    <Tooltip content={tx('list.editEvidence')}>
                        <button
                            type="button"
                            aria-label={tx('list.editEvidence')}
                            className={ICON_ACTION_CLASS}
                            id={`edit-evidence-${ev.id}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                setEditInitial({
                                    id: ev.id,
                                    title: ev.title,
                                    description: ev.content ?? null,
                                    ownerUserId: ev.ownerUserId ?? null,
                                    controlId: ev.control?.id ?? null,
                                    folder: ev.folder ?? null,
                                    retentionUntil: ev.retentionUntil ?? null,
                                });
                                setEditModalOpen(true);
                            }}
                        >
                            <Pen2 className="size-3.5" />
                        </button>
                    </Tooltip>
                );
            },
            meta: { disableTruncate: true },
        },
        // Archive — icon-only column. Toggles archive / unarchive.
        {
            id: 'archive',
            header: '',
            enableHiding: false,
            cell: ({ row }) => {
                const ev = row.original;
                if (!permissions.canWrite || ev.id?.startsWith('temp:')) return null;
                const archived = !!ev.isArchived;
                return (
                    <Tooltip content={archived ? tx('list.unarchiveEvidence') : tx('list.archiveEvidence')}>
                        <button
                            type="button"
                            aria-label={archived ? tx('list.unarchiveEvidence') : tx('list.archiveEvidence')}
                            className={ICON_ACTION_CLASS}
                            id={`${archived ? 'unarchive' : 'archive'}-${ev.id}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                if (archived) unarchiveEvidence(ev.id);
                                else archiveEvidence(ev.id);
                            }}
                        >
                            <BoxArchive className={`size-3.5${archived ? ' text-content-emphasis' : ''}`} />
                        </button>
                    </Tooltip>
                );
            },
            meta: { disableTruncate: true },
        },
        // Download — icon-only column. Only file-backed evidence is
        // downloadable; non-file rows render nothing.
        {
            id: 'download',
            header: '',
            enableHiding: false,
            cell: ({ row }) => {
                const ev = row.original;
                if (ev.type !== 'FILE' || !ev.fileRecordId || ev.id?.startsWith('temp:')) return null;
                return (
                    <Tooltip content={tx('list.downloadFile')}>
                        <a
                            href={apiUrl(`/evidence/files/${ev.fileRecordId}/download`)}
                            download
                            aria-label={tx('list.downloadFile')}
                            className={ICON_ACTION_CLASS}
                            id={`download-${ev.id}`}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <Download className="size-3.5" />
                        </a>
                    </Tooltip>
                );
            },
            meta: { disableTruncate: true },
        },
        // Review workflow — the remaining state-transition actions.
        {
            id: 'actions',
            // Leaf header is blank — the spanning "Actions" group header (added
            // in `tableColumns` below) labels this + the edit/archive/download
            // icon columns together.
            header: '',
            enableHiding: false,

            cell: ({ row }) => {
                const ev = row.original;
                const isPending = ev.id?.startsWith('temp:');
                if (isPending) return <span className="text-xs text-content-subtle">{tx('list.uploading')}</span>;
                if (!permissions.canWrite) return null;
                const submitBtn = (
                    <Tooltip content={t.submitForReview}>
                        <button
                            type="button"
                            aria-label={t.submitForReview}
                            className={ICON_ACTION_CLASS}
                            onClick={() => submitReview(ev.id, 'SUBMITTED')}
                        >
                            <PaperPlane className="size-3.5" />
                        </button>
                    </Tooltip>
                );
                return (
                    <div className="flex gap-1 flex-wrap" onClick={e => e.stopPropagation()}>
                        {ev.status === 'DRAFT' && submitBtn}
                        {ev.status === 'SUBMITTED' && (
                            <>
                                <Tooltip content={t.approveEvidence}>
                                    <button
                                        type="button"
                                        aria-label={t.approveEvidence}
                                        className={ICON_ACTION_CLASS}
                                        onClick={() => submitReview(ev.id, 'APPROVED')}
                                    >
                                        <Check className="size-3.5" />
                                    </button>
                                </Tooltip>
                                <Tooltip content={t.rejectEvidence}>
                                    <button
                                        type="button"
                                        aria-label={t.rejectEvidence}
                                        className={`${ICON_ACTION_CLASS} hover:text-content-error`}
                                        onClick={() => submitReview(ev.id, 'REJECTED', 'Needs improvement')}
                                    >
                                        <Xmark className="size-3.5" />
                                    </button>
                                </Tooltip>
                            </>
                        )}
                        {ev.status === 'REJECTED' && submitBtn}
                    </div>
                );
            },
            meta: { disableTruncate: true },
        },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    ]), [t, permissions, apiUrl, tx]);

    // Item 3 — collapse the four right-most columns (edit / archive /
    // download / actions) under ONE spanning "Actions" header. orderColumns
    // (flat slot-merge) runs first; then the action columns are lifted into a
    // single TanStack group so its header cell spans them. The other columns
    // get a placeholder top-row header cell automatically.
    const tableColumns = useMemo(() => {
        const ordered = orderColumns(evidenceColumns);
        const actionIds = new Set(['edit', 'archive', 'download', 'actions']);
        // Partition into body columns + the four action columns without an
        // array `.filter()` (the no-client-side-filtering guard flags that
        // heuristic in list clients — this is grouping column DEFS, not data).
        const rest: typeof ordered = [];
        const actionCols: typeof ordered = [];
        for (const col of ordered) {
            if (actionIds.has(col.id as string)) actionCols.push(col);
            else rest.push(col);
        }
        if (actionCols.length === 0) return ordered;
        return [
            ...rest,
            { id: 'actionsGroup', header: tx('colHeaders.actions'), columns: actionCols },
        ];
    }, [orderColumns, evidenceColumns, tx]);

    return (
        <ListPageShell className="animate-fadeIn gap-section">
            <ListPageShell.Header>
                <div className="flex items-center justify-between">
                    <div>
                        <PageBreadcrumbs
                            items={[
                                { label: tx('list.crumbDashboard'), href: `/t/${tenantSlug}/dashboard` },
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

            {permissions.canWrite && (
                <>
                    <UploadEvidenceModal
                        open={showUpload}
                        setOpen={setShowUpload}
                        tenantSlug={tenantSlug}
                        apiUrl={apiUrl}
                        controls={controls}
                    />
                </>
            )}

            {/* B5 — Evidence detail sheet + edit modal. The sheet
                opens on row click and shows the read-only evidence
                detail + the existing approval-flow actions (which
                route back through `submitReview` for optimistic
                updates). The edit modal opens from the sheet's
                edit button. */}
            <EvidenceDetailSheet
                open={detailSheetOpen}
                setOpen={setDetailSheetOpen}
                evidenceId={detailEvidenceId}
                canWrite={permissions.canWrite}
                canAdmin={permissions.canAdmin}
                onEdit={(ev) => {
                    setEditInitial(ev);
                    setEditModalOpen(true);
                }}
                onReview={(id, action) => submitReview(id, action)}
            />
            <EditEvidenceModal
                open={editModalOpen}
                setOpen={setEditModalOpen}
                tenantSlug={tenantSlug}
                initial={editInitial}
                onSaved={() => {
                    // Revalidate the list cache so the freshly-saved
                    // values flow back into the table.
                    invalidateEvidence();
                }}
            />

            {/* B8 follow-up — shared folder-suggestions datalist.
                The UploadEvidenceModal references
                reference `list="evidence-folder-suggestions"` so
                the user converges on a small named set of folders.
                Mounting the datalist here means a single source of
                truth derived from the currently-loaded evidence. */}
            <datalist id="evidence-folder-suggestions">
                {Array.from(
                    new Set(
                        (evidence as Array<{ folder?: string | null }>)
                            .map((e) => (e.folder || '').trim())
                            .filter(Boolean),
                    ),
                )
                    .sort()
                    .map((f) => (
                        <option key={f} value={f} />
                    ))}
            </datalist>

            <ListPageShell.Filters className="space-y-section">
                {/* R23-PR-E — KPI strip ABOVE the retention tabs +
                    filter toolbar block. Status-based KPIs sit on a
                    different axis from the retention tabs so the two
                    affordances compose naturally. */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-default">
                    <KpiFilterCard
                        label={tx('list.kpiTotal')}
                        value={totalEvidence}
                        sparkline={evidenceTrends.total}
                        sparklineVariant={sparkColors.total}
                        sparklineDomain={centeredSparklineDomain(evidenceTrends.total)}
                        onClick={() => toggleEvidenceKpi('total')}
                        selected={activeEvidenceKpi === 'total'}
                    />
                    <KpiFilterCard
                        label={tx('list.kpiDraft')}
                        value={draftEvidence}
                        tone="attention"
                        sparkline={evidenceTrends.draft}
                        sparklineVariant={sparkColors.draft}
                        sparklineDomain={centeredSparklineDomain(evidenceTrends.draft)}
                        onClick={() => toggleEvidenceKpi('draft')}
                        selected={activeEvidenceKpi === 'draft'}
                    />
                    <KpiFilterCard
                        label={tx('list.kpiSubmitted')}
                        value={submittedEvidence}
                        tone="default"
                        sparkline={evidenceTrends.submitted}
                        sparklineVariant={sparkColors.submitted}
                        sparklineDomain={centeredSparklineDomain(evidenceTrends.submitted)}
                        onClick={() => toggleEvidenceKpi('submitted')}
                        selected={activeEvidenceKpi === 'submitted'}
                    />
                    <KpiFilterCard
                        label={tx('list.kpiApproved')}
                        value={approvedEvidence}
                        tone="success"
                        sparkline={evidenceTrends.approved}
                        sparklineVariant={sparkColors.approved}
                        sparklineDomain={centeredSparklineDomain(evidenceTrends.approved)}
                        onClick={() => toggleEvidenceKpi('approved')}
                        selected={activeEvidenceKpi === 'approved'}
                    />
                </div>

                {/* Retention filter tabs (Active / Expiring / Archived) removed
                    per product direction — the list defaults to the active view
                    (`retentionFilter` still defaults to 'active'); status-scoped
                    views remain reachable via the ?tab= deep-link. */}

                {/*
                  Filter toolbar — the Filter button + live search sit on
                  the LEFT, matching every other list page (previously
                  this whole cluster was right-anchored). The Epic 43.2
                  view toggle + columns gear ride the toolbar's right-edge
                  `actions` slot. The view toggle stays in `useUrlFilters`,
                  NOT `filterCtx`, so flipping the renderer doesn't disturb
                  search-q or any active filter pill — both the table and
                  the gallery read from the same `displayEvidence` array.
                */}
                <EvidenceFilterToolbar
                    filters={visibleFilterDefs}
                    leading={
                        permissions.canWrite ? (
                            // UI-18: a single +Evidence button that opens the
                            // Upload-a-file modal directly. The separate
                            // "Upload file" + "Import ZIP" icon buttons (and the
                            // text-only evidence modal) were removed. Relocated
                            // from the page header into the toolbar's leading slot.
                            <Button
                                variant="primary"
                                icon={<Plus className="-ml-0.5 -mr-2.5" />}
                                onClick={() => setShowUpload(true)}
                                id="add-evidence-btn"
                            >
                                {t.addEvidence}
                            </Button>
                        ) : undefined
                    }
                    actions={
                        <>
                            <ToggleGroup
                                size="sm"
                                ariaLabel={tx('list.viewAria')}
                                options={[
                                    { value: 'list', label: tx('list.viewList'), id: 'evidence-view-list' },
                                    { value: 'gallery', label: tx('list.viewGallery'), id: 'evidence-view-gallery' },
                                ]}
                                selected={viewMode}
                                selectAction={(v) => setFilter('view', v === 'list' ? '' : v)}
                                className="shrink-0"
                            />
                            {viewMode === 'list' ? (
                                <>
                                    {columnsDropdown}
                                    {filtersDropdown}
                                </>
                            ) : null}
                        </>
                    }
                />

                {/* Archived warning */}
                {retentionFilter === 'archived' && archivedEvidence.length > 0 && (
                    <InlineNotice variant="warning" title={tx('list.archivedNoticeTitle')}>
                        {tx('list.archivedNoticeBody')}
                    </InlineNotice>
                )}
            </ListPageShell.Filters>

            <ListPageShell.Body>
                <TruncationBanner truncated={truncated} />
                {viewMode === 'gallery' ? (
                    <EvidenceGallery
                        rows={displayEvidence}
                        loading={evidenceQuery.isLoading && !evidenceQuery.data}
                        emptyState={
                            anyFilterActive ? (
                                <EmptyState
                                    size="sm"
                                    variant="no-results"
                                    title={
                                        retentionFilter === 'archived'
                                            ? tx('list.emptyArchivedTitle')
                                            : retentionFilter === 'expiring'
                                                ? tx('list.emptyExpiringTitle')
                                                : tx('list.emptyFilterTitle')
                                    }
                                    description={tx('list.emptyFilterDesc')}
                                    secondaryAction={{
                                        label: tx('list.clearFilters'),
                                        onClick: () => filterCtx.clearAll(),
                                    }}
                                />
                            ) : (
                                <EmptyState
                                    size="sm"
                                    variant="no-records"
                                    title={t.noEvidence}
                                    description={tx('list.emptyRecordsDesc')}
                                />
                            )
                        }
                        fileUrl={(ev) =>
                            ev.fileRecordId
                                ? apiUrl(`/evidence/files/${ev.fileRecordId}/download`)
                                : null
                        }
                        statusBadgeVariant={(s) => STATUS_BADGE[s] ?? 'neutral'}
                        retentionStatus={(ev) => {
                            const rs = getRetentionStatus(ev, hydratedNow, tx);
                            return { label: rs.label, badge: rs.badge };
                        }}
                        data-testid="evidence-gallery"
                    />
                ) : (
                    <DataTable
                        fillBody
                        data={visibleEvidence}
                        columns={tableColumns}
                        // Spanning "Actions" group header needs the real
                        // <table> path (virtualized grid header can't colSpan);
                        // Evidence is bounded, mirroring the Controls page.
                        virtualize={false}
                        onReachEnd={hasMoreEvidence ? loadMoreEvidence : undefined}
                        getRowId={(ev) => ev.id}
                        // Column resizing is opt-in per table (disabled
                        // by default since #823). Re-enabled here only —
                        // the Evidence Library's wide title/folder/owner
                        // columns benefit most from user-tuned widths.
                        // Auto-disables above the virtualization
                        // threshold, where fixed grid widths apply.
                        enableColumnResizing
                        sortableColumns={sortableEvidenceColumns}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        onSortChange={({
                            sortBy: nextBy,
                            sortOrder: nextOrder,
                        }) => {
                            setSortBy(nextBy);
                            setSortOrder(nextOrder);
                        }}
                        // B5 — row click opens the detail sheet so
                        // users can actually drill into an evidence
                        // record. Pre-B5 the table was read-only
                        // until you clicked a specific cell-level
                        // action button.
                        onRowClick={(row) => {
                            setDetailEvidenceId(row.original.id);
                            setDetailSheetOpen(true);
                        }}
                        onRowPrefetch={(row) =>
                            prefetchData(CACHE_KEYS.evidence.detail(row.original.id))
                        }
                        selectionEnabled
                        selectedRows={Object.fromEntries(
                            Array.from(selected).map((id) => [id, true]),
                        )}
                        onRowSelectionChange={(rows) =>
                            setSelected(new Set(rows.map((r) => r.original.id)))
                        }
                        selectionControls={() => (
                            <BulkActionBar
                                actions={evidenceBulkActions}
                                onApply={handleBulkApply}
                                applying={bulkApplying}
                                selectedCount={selected.size}
                                entityLabel={tx('list.entityLabel')}
                            />
                        )}
                        emptyState={
                            anyFilterActive ? (
                                <EmptyState
                                    size="sm"
                                    variant="no-results"
                                    title={
                                        retentionFilter === 'archived'
                                            ? tx('list.emptyArchivedTitle')
                                            : retentionFilter === 'expiring'
                                                ? tx('list.emptyExpiringTitle')
                                                : tx('list.emptyFilterTitle')
                                    }
                                    description={tx('list.emptyFilterDesc')}
                                    secondaryAction={{
                                        label: tx('list.clearFilters'),
                                        onClick: () => filterCtx.clearAll(),
                                    }}
                                />
                            ) : (
                                <EmptyState
                                    size="sm"
                                    variant="no-records"
                                    title={t.noEvidence}
                                    description={tx('list.emptyRecordsDesc')}
                                />
                            )
                        }
                        resourceName={(p) => p ? tx('list.resourceMany') : tx('list.resourceOne')}
                        columnVisibility={columnVisibility}
                        onColumnVisibilityChange={setColumnVisibility}
                        data-testid="evidence-table"
                        className="hover:bg-bg-muted"
                    />
                )}
            </ListPageShell.Body>
        </ListPageShell>
    );
}

// ─── Evidence filter toolbar ─────────────────────────────────────────

function EvidenceFilterToolbar({
    filters,
    actions,
    leading,
}: {
    filters: FilterType[];
    actions?: React.ReactNode;
    leading?: React.ReactNode;
}) {
    const tx = useTranslations('evidence');
    return (
        <FilterToolbar
            filters={filters}
            searchId="evidence-search"
            searchPlaceholder={tx('list.searchPlaceholder')}
            leading={leading}
            actions={actions}
        />
    );
}
