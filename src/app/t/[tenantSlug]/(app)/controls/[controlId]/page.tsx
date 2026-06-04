'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

import { formatDate, formatDateTime } from '@/lib/format-date';
import { SkeletonCard } from '@/components/ui/skeleton';
import { InlineEmptyState } from '@/components/ui/inline-empty-state';
import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { Heading, textLinkVariants } from '@/components/ui/typography';
import { CardHeader } from '@/components/ui/card-header';
import { EditControlModal } from './_modals/EditControlModal';
import { ControlReverseLookupModal } from '@/components/controls/ControlReverseLookupModal';
import { ControlMappingsTab } from './_tabs/ControlMappingsTab';
import { EvidenceSubTable } from './_tabs/EvidenceSubTable';
import { MetaStrip } from '@/components/ui/meta-strip';
import { CONTROL_STATUS_VARIANT } from '@/app-layer/domain/entity-status-mapping';
// Inline pencil icon to avoid lucide-react barrel import issue with Next.js 14
const PencilIcon = ({ size = 14 }: { size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
);
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { DataTable, createColumns } from '@/components/ui/table';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useTenantMutation } from '@/lib/hooks/use-tenant-mutation';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { extractMutationError } from '@/lib/mutations';
import { useToastWithUndo } from '@/components/ui/hooks';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Tooltip } from '@/components/ui/tooltip';
import { CopyText } from '@/components/ui/copy-text';
import { ProgressBar } from '@/components/ui/progress-bar';
import dynamic from 'next/dynamic';
import { EntityDetailLayout } from '@/components/layout/EntityDetailLayout';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@/lib/cn';

const TraceabilityPanel = dynamic(() => import('@/components/TraceabilityPanel'), {
    loading: () => <SkeletonCard lines={3} />,
    ssr: false,
});
// Epic G-5 — exceptions panel + header badge. The badge alone is
// loaded eagerly via a tiny named import so the control header can
// surface "Exception: APPROVED" without waiting for the modal
// machinery in the panel chunk.
const ControlExceptionsPanel = dynamic(
    () => import('@/components/ControlExceptionsPanel').then((m) => m.ControlExceptionsPanel),
    {
        loading: () => <SkeletonCard lines={3} />,
        ssr: false,
    },
);
const ControlExceptionHeaderBadge = dynamic(
    () => import('@/components/ControlExceptionsPanel').then((m) => m.ControlExceptionHeaderBadge),
    { ssr: false },
);
const TestPlansPanel = dynamic(() => import('@/components/TestPlansPanel'), {
    loading: () => <SkeletonCard lines={3} />,
    ssr: false,
});
const LinkedTasksPanel = dynamic(() => import('@/components/LinkedTasksPanel'), {
    loading: () => <SkeletonCard lines={3} />,
    ssr: false,
});
import type {
    ControlDetailDTO, ControlTaskDTO, EvidenceLinkDTO,
    ContributorDTO, AuditLogEntry,
} from '@/lib/dto';

// Polish PR-1 — STATUS_BADGE moved to shared domain mapping as
// CONTROL_STATUS_VARIANT in @/app-layer/domain/entity-status-mapping.
// Labels stay local because they're presentation copy.
const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', IMPLEMENTED: 'Implemented',
    NEEDS_REVIEW: 'Needs Review',
};
const TASK_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    OPEN: 'neutral', IN_PROGRESS: 'info', DONE: 'success', BLOCKED: 'error',
};
const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};
const AUTOMATION_TYPE_LABELS: Record<string, string> = {
    AUTOMATED: 'Automated', MANUAL: 'Manual', IT_DEPENDENT_MANUAL: 'IT-Dependent Manual',
};
const MITIGATION_TYPE_LABELS: Record<string, string> = {
    PREVENTIVE: 'Preventive', DETECTIVE: 'Detective', DETERRENT: 'Deterrent',
    CORRECTIVE: 'Corrective', COMPENSATING: 'Compensating',
};
const FREQ_OPTIONS = ['', 'AD_HOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'];
const FREQ_CB_OPTIONS: ComboboxOption[] = FREQ_OPTIONS.filter(Boolean).map(f => ({ value: f, label: FREQ_LABELS[f] || f }));
const CATEGORY_OPTIONS = ['', 'ORGANIZATIONAL', 'PEOPLE', 'PHYSICAL', 'TECHNOLOGICAL'];
const CATEGORY_LABELS: Record<string, string> = {
    ORGANIZATIONAL: 'Organizational', PEOPLE: 'People', PHYSICAL: 'Physical', TECHNOLOGICAL: 'Technological',
};
const CATEGORY_CB_OPTIONS: ComboboxOption[] = CATEGORY_OPTIONS.filter(Boolean).map(c => ({ value: c, label: CATEGORY_LABELS[c] || c }));
const STATUS_CB_OPTIONS: ComboboxOption[] = Object.entries(STATUS_LABELS).map(([val, lbl]) => ({ value: val, label: lbl }));

type Tab = 'overview' | 'tasks' | 'evidence' | 'mappings' | 'traceability' | 'activity' | 'tests';

/**
 * Evidence-tab payload — `GET /controls/{id}/evidence` (#102 item 1).
 * Carries both the manual evidence links and the `Evidence` entities
 * attached directly to the control.
 */
interface EvidenceTabData {
    links: EvidenceLinkDTO[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    evidence: any[];
}

const EVENT_LABELS: Record<string, string> = {
    CONTROL_CREATED: 'Created', CONTROL_UPDATED: 'Updated', CONTROL_STATUS_CHANGED: 'Status Changed',
    CONTROL_APPLICABILITY_CHANGED: 'Applicability Changed', CONTROL_OWNER_CHANGED: 'Owner Changed',
    CONTROL_CONTRIBUTOR_ADDED: 'Contributor Added', CONTROL_CONTRIBUTOR_REMOVED: 'Contributor Removed',
    CONTROL_TASK_CREATED: 'Task Created', CONTROL_TASK_COMPLETED: 'Task Completed',
    CONTROL_TASK_UPDATED: 'Task Updated', CONTROL_EVIDENCE_LINKED: 'Evidence Linked',
    CONTROL_EVIDENCE_UNLINKED: 'Evidence Unlinked', CONTROL_TEST_COMPLETED: 'Test Completed',
    CONTROL_INSTALLED_FROM_TEMPLATE: 'Installed from Template',
};

export default function ControlDetailPage() {
    const params = useParams();
    const apiUrl = useTenantApiUrl();
    const tenantHref = useTenantHref();
    const { permissions, tenantSlug } = useTenantContext();
    const controlId = params?.controlId as string;
    const triggerUndoToast = useToastWithUndo();

    // ─── Page data — Epic 69 SWR-first read ──────────────────────────
    //
    // Hits `/controls/:id/page-data` which collapses the prior
    // serial waterfall (GET /controls/:id THEN GET /controls/:id/sync)
    // into one round-trip. The sync sub-payload is `null` for
    // controls without an `automationKey` or when the mapping lookup
    // fails — the page renders the conflict badge unconditionally
    // against it.
    //
    // Epic 69 migration: this read used to flow through TanStack
    // React Query (`useQuery` + `queryKeys.controls.detail`). It's
    // now a `useTenantSWR` against `CACHE_KEYS.controls.pageData(id)`
    // so the status mutation below can apply optimistic updates that
    // the rest of the UI sees immediately. Other pages on this
    // codebase still use React Query — that migration is incremental.
    interface ControlPageDataDTO {
        // `_count` carries the tab badge counts; `doneControlTasks`
        // backs the Overview "Tasks Progress" widget (#102 item 1) —
        // the heavy relation arrays no longer ride on this payload.
        control: ControlDetailDTO & { doneControlTasks?: number };
        syncStatus: {
            syncStatus: string | null;
            lastSyncedAt: string | null;
            errorMessage: string | null;
            provider: string | null;
        } | null;
    }
    const pageDataKey = controlId
        ? CACHE_KEYS.controls.pageData(controlId)
        : null;
    const pageDataQuery = useTenantSWR<ControlPageDataDTO>(pageDataKey);
    const control = pageDataQuery.data?.control ?? null;
    const loading = pageDataQuery.isLoading;
    const error =
        pageDataQuery.error
            ? pageDataQuery.error.message || 'Control not found'
            : '';
    // Stable revalidation handle that mirrors the prior `refetch()`
    // contract — `mutate(undefined)` re-runs the fetcher for this
    // hook's key. Wrapped in `useCallback` so the call sites that
    // pass it down to event handlers don't re-bind on every render.
    const refetch = useCallback(
        () => pageDataQuery.mutate(),
        [pageDataQuery],
    );
    const initialSyncStatus = pageDataQuery.data?.syncStatus ?? null;
    const [tab, setTab] = useState<Tab>('overview');

    // ─── Per-tab lazy reads (#102 item 1) ───────────────────────────
    //
    // The Tasks / Evidence / Mappings tab bodies each fetch their own
    // slice on demand. The SWR key is `null` until that tab is the
    // active one, so nothing loads until the user opens the tab — and
    // `getControlHeader` no longer eager-loads these four arrays into
    // the page-data payload. Mirrors the existing Activity /
    // Traceability / Tests panels, which already self-fetch.
    const tasksSWR = useTenantSWR<ControlTaskDTO[]>(
        controlId && tab === 'tasks'
            ? CACHE_KEYS.controls.tasks(controlId)
            : null,
    );
    const evidenceSWR = useTenantSWR<EvidenceTabData>(
        controlId && tab === 'evidence'
            ? CACHE_KEYS.controls.evidence(controlId)
            : null,
    );

    // Status change
    const [changingStatus, setChangingStatus] = useState(false);

    // Applicability
    const [showApplicability, setShowApplicability] = useState(false);
    const [appChoice, setAppChoice] = useState('APPLICABLE');
    const [appJustification, setAppJustification] = useState('');
    const [savingApp, setSavingApp] = useState(false);
    // Epic P2-PR-C — reverse-lookup modal. "Where is this control
    // used in process maps?" — opens from a header button.
    const [reverseLookupOpen, setReverseLookupOpen] = useState(false);

    // Task creation

    // Evidence linking
    const [showEvidenceForm, setShowEvidenceForm] = useState(false);
    const [evidenceUrl, setEvidenceUrl] = useState('');
    const [evidenceNote, setEvidenceNote] = useState('');
    const [savingEvidence, setSavingEvidence] = useState(false);

    // File upload for this control (folded into the "+ Evidence" form)
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [fileUploadTitle, setFileUploadTitle] = useState('');
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState('');
    const fileUploadRef = useRef<HTMLInputElement>(null);

    // Activity trail
    const [activity, setActivity] = useState<AuditLogEntry[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);

    // Sync status — drives the header conflict/synced badges (the
    // overview Automation section + manual "Sync Now" were removed).
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [syncLastAt, setSyncLastAt] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', intent: '', category: '', frequency: '', owner: '', automationType: '', mitigationType: '' });
    const [savingEdit, setSavingEdit] = useState(false);
    const [editError, setEditError] = useState('');
    const [editSuccess, setEditSuccess] = useState(false);

    // (fetchControl replaced by useQuery above — use refetch() below)

    // ─── Edit modal handlers ───

    const openEditModal = () => {
        if (!control) return;
        setEditForm({
            name: control.name || '',
            description: control.description || '',
            intent: control.intent || '',
            category: control.category || '',
            frequency: control.frequency || '',
            owner: control.ownerUserId || '',
            automationType: control.automationType || '',
            mitigationType: control.mitigationType || '',
        });
        setEditError('');
        setEditSuccess(false);
        setShowEditModal(true);
    };


    // ─── Mutation: edit control ─────────────────────────────────────
    //
    // Epic 69 migration — the prior React Query `useMutation` with
    // `onMutate` / `onError` rollback hooks is now a single
    // `useTenantMutation`. The optimistic update walks the cached
    // page-data shape (control nested under `pageData.control`)
    // because the SWR cache holds the whole envelope, not the bare
    // detail. Rollback is automatic on throw via SWR's
    // `rollbackOnError: true` default.
    const editMutation = useTenantMutation<
        ControlPageDataDTO,
        typeof editForm,
        unknown
    >({
        key: pageDataKey ?? '',
        mutationFn: async (form) => {
            const res = await fetch(apiUrl(`/controls/${controlId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    intent: form.intent.trim() || null,
                    category: form.category.trim() || null,
                    frequency: form.frequency || null,
                }),
            });
            if (!res.ok) {
                const err = await res
                    .json()
                    .catch(() => ({ error: 'Update failed' }));
                throw new Error(extractMutationError(err, 'Update failed'));
            }
            // If owner changed, call the separate owner endpoint
            const originalOwner = control?.ownerUserId || '';
            if (form.owner.trim() !== originalOwner) {
                const ownerRes = await fetch(
                    apiUrl(`/controls/${controlId}/owner`),
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            ownerUserId: form.owner.trim() || null,
                        }),
                    },
                );
                if (!ownerRes.ok) {
                    const ownerErr = await ownerRes
                        .json()
                        .catch(() => ({ error: 'Owner update failed' }));
                    throw new Error(
                        extractMutationError(ownerErr, 'Owner update failed'),
                    );
                }
            }
            return form;
        },
        optimisticUpdate: (current, form) =>
            current
                ? {
                      ...current,
                      control: {
                          ...current.control,
                          name: form.name.trim(),
                          description: form.description.trim() || null,
                          intent: form.intent.trim() || null,
                          category: form.category.trim() || null,
                          frequency: form.frequency || null,
                      },
                  }
                : (current as unknown as ControlPageDataDTO),
        // Refresh the list cache too — the controls list page shows
        // these same fields.
        invalidate: [CACHE_KEYS.controls.list()],
    });

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.name || editForm.name.trim().length < 3) {
            setEditError('Title must be at least 3 characters.');
            return;
        }
        setSavingEdit(true);
        setEditError('');
        try {
            await editMutation.trigger(editForm);
            setShowEditModal(false);
            setEditSuccess(true);
            setTimeout(() => setEditSuccess(false), 3000);
        } catch (err) {
            setEditError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setSavingEdit(false);
        }
    };

    const handleEditCancel = () => {
        setShowEditModal(false);
        setEditError('');
    };

    // Fetch activity when activity tab opens
    useEffect(() => {
        if (tab !== 'activity') return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setActivityLoading(true);
        fetch(apiUrl(`/controls/${controlId}/activity`)).then(r => r.ok ? r.json() : []).then(setActivity).catch(() => { }).finally(() => setActivityLoading(false));
    }, [tab, apiUrl, controlId]);

    // Hydrate sync status from the page-data response (one round-trip
    // instead of the previous control-then-sync waterfall). The
    // dependency on the data identity — not just on automationKey —
    // ensures the badge updates after `refetch()` lands a fresh
    // page-data payload (e.g. after Sync Now or after an edit that
    // changes the automationKey).
    useEffect(() => {
        if (!initialSyncStatus) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setSyncStatus(null);
            setSyncLastAt(null);
            setSyncError(null);
            return;
        }
        setSyncStatus(initialSyncStatus.syncStatus ?? null);
        setSyncLastAt(initialSyncStatus.lastSyncedAt ?? null);
        setSyncError(initialSyncStatus.errorMessage ?? null);
    }, [initialSyncStatus]);

    // ─── Mutation: change control status (Epic 69 pilot #2) ────────
    //
    // The headline migration of this file. The previous flow was
    // `fetch(POST /status) → await refetch() → invalidateQueries(list)`,
    // a coarse round-trip that left the badge showing the old value
    // for the duration of the network call.
    //
    // The new flow uses `useTenantMutation`:
    //
    //   1. `optimisticUpdate` flips `control.status` in the cached
    //      page-data envelope synchronously — the badge re-renders
    //      with the predicted value before the POST is sent.
    //   2. `mutationFn` performs the POST. A non-2xx response throws.
    //   3. On success, SWR background-revalidates the page-data key
    //      (re-fetches `/controls/{id}/page-data`) — confirming the
    //      server agrees with the prediction. The `invalidate`
    //      sibling (`/controls`) refreshes the list page in parallel.
    //   4. On failure, `rollbackOnError: true` (the default) restores
    //      the prior `control.status` automatically — the badge
    //      flips back to the original value with no spinner thrash.
    //
    // No `router.refresh()` involved. No coarse page reload. No
    // imperative `refetch()` chained behind state setters.
    const statusMutation = useTenantMutation<
        ControlPageDataDTO,
        { status: string },
        unknown
    >({
        key: pageDataKey ?? '',
        mutationFn: async ({ status }) => {
            const res = await fetch(apiUrl(`/controls/${controlId}/status`), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status }),
            });
            if (!res.ok) {
                const err = await res
                    .json()
                    .catch(() => ({ error: 'Status update failed' }));
                throw new Error(
                    extractMutationError(err, 'Status update failed'),
                );
            }
            return res.json().catch(() => null);
        },
        optimisticUpdate: (current, { status }) =>
            current
                ? {
                      ...current,
                      control: { ...current.control, status },
                  }
                : (current as unknown as ControlPageDataDTO),
        // List page shows status badges too — keep it in sync.
        invalidate: [CACHE_KEYS.controls.list()],
    });

    const changeStatus = async (status: string) => {
        setChangingStatus(true);
        try {
            await statusMutation.trigger({ status });
        } catch {
            // Rollback already applied by the hook; the error is
            // available on `statusMutation.error` for any future
            // toast surface. Status badge has reverted on its own.
        } finally {
            setChangingStatus(false);
        }
    };

    const saveApplicability = async () => {
        if (appChoice === 'NOT_APPLICABLE' && !appJustification.trim()) return;
        setSavingApp(true);
        await fetch(apiUrl(`/controls/${controlId}/applicability`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ applicability: appChoice, justification: appChoice === 'NOT_APPLICABLE' ? appJustification : null }),
        });
        await refetch();
        setSavingApp(false);
        setShowApplicability(false);
    };

    const updateTaskStatus = async (taskId: string, status: string) => {
        await fetch(apiUrl(`/controls/tasks/${taskId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await Promise.all([tasksSWR.mutate(), refetch()]);
    };

    // R11-PR6 — control tasks moved off raw <table> to DataTable so
    // the chrome matches every other table in the product.
    const controlTaskColumns = useMemo(
        () =>
            createColumns<ControlTaskDTO>([
                {
                    id: 'title',
                    header: 'Title',
                    accessorKey: 'title',
                    cell: ({ getValue }) => (
                        <span className="text-sm text-content-emphasis">
                            {getValue() as string}
                        </span>
                    ),
                },
                {
                    id: 'status',
                    header: 'Status',
                    accessorKey: 'status',
                    cell: ({ getValue }) => {
                        const status = getValue() as string;
                        return (
                            <StatusBadge
                                variant={TASK_STATUS_BADGE[status] || 'neutral'}
                            >
                                {status}
                            </StatusBadge>
                        );
                    },
                },
                {
                    id: 'assignee',
                    header: 'Assignee',
                    cell: ({ row }) => (
                        <span className="text-xs text-content-muted">
                            {row.original.assignee?.name || '—'}
                        </span>
                    ),
                },
                {
                    id: 'dueAt',
                    header: 'Due',
                    accessorKey: 'dueAt',
                    cell: ({ getValue }) => {
                        const value = getValue() as string | null;
                        return (
                            <span className="text-xs text-content-muted">
                                {value ? formatDate(value) : '—'}
                            </span>
                        );
                    },
                },
                ...(permissions.canWrite
                    ? [
                          {
                              id: 'actions',
                              header: 'Actions',
                              cell: ({ row }) =>
                                  row.original.status !== 'DONE' ? (
                                      <Button
                                          variant="secondary"
                                          size="sm"
                                          onClick={() =>
                                              updateTaskStatus(
                                                  row.original.id,
                                                  'DONE',
                                              )
                                          }
                                          id={`mark-done-${row.original.id}`}
                                      >
                                          Done
                                      </Button>
                                  ) : null,
                          } as Parameters<typeof createColumns<ControlTaskDTO>>[0][number],
                      ]
                    : []),
            ]),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [permissions.canWrite],
    );

    const resetEvidenceForm = () => {
        setEvidenceUrl('');
        setEvidenceNote('');
        setFileToUpload(null);
        setFileUploadTitle('');
        setFileUploadError('');
        if (fileUploadRef.current) fileUploadRef.current.value = '';
        setShowEvidenceForm(false);
    };

    // Unified "+ Evidence" submit. The single form supports BOTH a file
    // upload (browse + title) and a URL link. A chosen file takes
    // precedence: it uploads via /evidence/uploads (FileRecord +
    // Evidence(FILE) + ControlEvidenceLink); otherwise a non-empty URL
    // links a LINK evidence record. Both land in this control's Evidence
    // tab + the Evidence Library.
    const addEvidence = async (e: React.FormEvent) => {
        e.preventDefault();
        setFileUploadError('');

        if (fileToUpload) {
            setFileUploading(true);
            try {
                const formData = new FormData();
                formData.append('file', fileToUpload);
                if (fileUploadTitle) formData.append('title', fileUploadTitle);
                formData.append('controlId', controlId);
                const res = await fetch(apiUrl('/evidence/uploads'), { method: 'POST', body: formData });
                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: 'Upload failed' }));
                    throw new Error(err.error || err.message || 'Upload failed');
                }
                resetEvidenceForm();
                await Promise.all([evidenceSWR.mutate(), refetch()]);
            } catch (err: unknown) {
                setFileUploadError(err instanceof Error ? err.message : 'Upload failed');
            } finally {
                setFileUploading(false);
            }
            return;
        }

        if (!evidenceUrl.trim()) {
            setFileUploadError('Choose a file to upload, or enter an evidence URL.');
            return;
        }
        setSavingEvidence(true);
        try {
            const res = await fetch(apiUrl(`/controls/${controlId}/evidence`), {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ kind: 'LINK', url: evidenceUrl, note: evidenceNote || undefined }),
            });
            if (!res.ok) throw new Error('Failed to link evidence');
            resetEvidenceForm();
            await Promise.all([evidenceSWR.mutate(), refetch()]);
        } catch (err: unknown) {
            setFileUploadError(err instanceof Error ? err.message : 'Failed to link evidence');
        } finally {
            setSavingEvidence(false);
        }
    };

    // Epic 67 — delayed-commit unlink. Optimistic remove via SWR
    // `mutate(key, value, { revalidate: false })` so the row
    // disappears immediately; the actual DELETE fires after the 5 s
    // undo window. Snapshot is the WHOLE pageData so undo can
    // restore even if the user concurrently triggered another
    // change.
    //
    // Migrated from `queryClient.setQueryData/getQueryData` to the
    // SWR equivalent in the Epic 69 pass — semantics identical.
    const unlinkEvidence = (linkId: string) => {
        // Epic 67 delayed-commit unlink — now scoped to the Evidence
        // tab's own SWR cache (#102 item 1). Optimistically drop the
        // link so the row disappears immediately; the DELETE fires
        // after the 5 s undo window. Snapshot is the whole tab
        // payload so undo restores even after a concurrent change.
        const previous = evidenceSWR.data;
        if (previous) {
            evidenceSWR.mutate(
                {
                    ...previous,
                    links: previous.links.filter(
                        (link) => link.id !== linkId,
                    ),
                },
                { revalidate: false },
            );
        }
        triggerUndoToast({
            message: 'Evidence unlinked',
            undoMessage: 'Undo',
            action: async () => {
                const res = await fetch(
                    apiUrl(`/controls/${controlId}/evidence/${linkId}`),
                    { method: 'DELETE' },
                );
                if (!res.ok) throw new Error('Unlink failed');
                // Confirm the tab list + refresh the header badge.
                await Promise.all([evidenceSWR.mutate(), refetch()]);
            },
            undoAction: () => {
                if (previous) {
                    evidenceSWR.mutate(previous, { revalidate: false });
                }
            },
            onError: () => {
                if (previous) {
                    evidenceSWR.mutate(previous, { revalidate: false });
                }
            },
        });
    };

    // Loading / error / empty states render through the shared
    // EntityDetailLayout — same skeleton + same error/empty copy
    // every detail page in Inflect uses.
    if (loading) {
        return (
            <EntityDetailLayout loading title="">
                {null}
            </EntityDetailLayout>
        );
    }
    if (error) {
        return (
            <EntityDetailLayout error={error} title="">
                {null}
            </EntityDetailLayout>
        );
    }
    if (!control) {
        return (
            <EntityDetailLayout empty={{ message: 'Control not found.' }} title="">
                {null}
            </EntityDetailLayout>
        );
    }

    // Tab badge counts + Overview progress now read `_count` off the
    // header payload (#102 item 1) — the relation arrays no longer
    // ride on page-data. The Evidence badge is `links + evidence`
    // counts; the prior exact de-dup of file-backed evidence already
    // linked is dropped — a badge tolerates the rare double-count.
    const totalTasks = control._count?.controlTasks ?? 0;
    const doneTasks = control.doneControlTasks ?? 0;
    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'overview', label: 'Overview' },
        { key: 'tasks', label: 'Tasks', count: totalTasks },
        {
            key: 'evidence',
            label: 'Evidence',
            count:
                (control._count?.evidenceLinks ?? 0) +
                (control._count?.evidence ?? 0),
        },
        { key: 'mappings', label: 'Mappings', count: control._count?.frameworkMappings ?? 0 },
        { key: 'traceability', label: 'Traceability' },
        { key: 'activity', label: 'Activity' },
        { key: 'tests', label: 'Tests' },
    ];

    // ── Header meta strip (Polish PR-1) ──
    //
    // Replaced a 6-badge fragment with the shared <MetaStrip>
    // primitive. Sync-state indicators (CONFLICT / FAILED / SYNCED)
    // moved OUT of meta into a per-page InlineNotice — they're
    // alerts, not metadata. The exception badge stays as a
    // status-shaped meta entry; the per-control code stays as a
    // copyable text entry.
    const headerMeta = (
        <MetaStrip
            items={[
                ...(control.code
                    ? [
                          {
                              label: 'Code',
                              value: (
                                  <CopyText
                                      value={control.code}
                                      label={`Copy control code ${control.code}`}
                                      successMessage="Control code copied"
                                      className="text-xs text-content-subtle"
                                  >
                                      {control.code}
                                  </CopyText>
                              ),
                          } as const,
                      ]
                    : []),
                {
                    kind: 'status' as const,
                    id: 'control-status',
                    label: 'Status',
                    value: STATUS_LABELS[control.status] ?? control.status,
                    variant:
                        CONTROL_STATUS_VARIANT[control.status] ?? 'neutral',
                },
                {
                    kind: 'status' as const,
                    id: 'control-applicability',
                    label: 'Applicability',
                    value:
                        control.applicability === 'NOT_APPLICABLE'
                            ? 'Not Applicable'
                            : 'Applicable',
                    variant:
                        control.applicability === 'NOT_APPLICABLE'
                            ? 'warning'
                            : 'success',
                },
            ]}
        />
    );

    // Sync state migrated out of the meta strip — shown as a banner
    // below the page header so the meta strip stays at 3 stable
    // items.
    const syncBanner = (
        <>
            {syncStatus === 'CONFLICT' && (
                <Tooltip
                    title="Sync conflict"
                    content={syncError ?? 'Local and remote state diverged — resolve before editing.'}
                >
                    <StatusBadge variant="error" className="flex items-center gap-1 cursor-help" id="sync-conflict-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                        Sync Conflict
                    </StatusBadge>
                </Tooltip>
            )}
            {syncStatus === 'FAILED' && (
                <Tooltip
                    title="Last sync failed"
                    content={syncError ?? 'The integration could not reach the source system.'}
                >
                    <StatusBadge variant="error" className="flex items-center gap-1 cursor-help" id="sync-failed-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                        Sync Failed
                    </StatusBadge>
                </Tooltip>
            )}
            {syncStatus === 'SYNCED' && (
                <Tooltip content={syncLastAt ? `Last synced: ${formatDateTime(syncLastAt)}` : 'Synced'}>
                    <StatusBadge variant="success" className="flex items-center gap-1 cursor-help" id="sync-ok-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        Synced
                    </StatusBadge>
                </Tooltip>
            )}
            <ControlExceptionHeaderBadge
                tenantSlug={tenantSlug}
                controlId={control.id}
            />
        </>
    );

    // ── Header actions (right side) ──
    const headerActions = (
        <>
            {/* Epic P2-PR-C — Where used in process maps. Visible to
                all viewers (readers + auditors need it most). */}
            <Button
                variant="secondary"
                onClick={() => setReverseLookupOpen(true)}
                id="control-where-used-btn"
                data-testid="control-where-used-btn"
            >
                Where used
            </Button>
            {permissions.canWrite && (
                <>
                    <Combobox
                        hideSearch
                        id="control-status-select"
                        selected={STATUS_CB_OPTIONS.find(o => o.value === control.status) ?? null}
                        setSelected={(opt) => { if (opt) changeStatus(opt.value); }}
                        options={STATUS_CB_OPTIONS}
                        disabled={changingStatus}
                        placeholder="Status"
                        buttonProps={{ className: 'text-sm' }}
                    />
                    <Button variant="secondary" onClick={() => { setAppChoice(control.applicability); setAppJustification(control.applicabilityJustification || ''); setShowApplicability(!showApplicability); }} id="toggle-applicability-btn">
                        Applicability
                    </Button>
                </>
            )}
        </>
    );

    return (
        <EntityDetailLayout
            id="control-detail-page"
            breadcrumbs={[
                { label: 'Dashboard', href: tenantHref('/dashboard') },
                { label: 'Controls', href: tenantHref('/controls') },
                { label: control.name },
            ]}
            title={<span id="control-title">{control.name}</span>}
            meta={headerMeta}
            actions={headerActions}
            tabs={tabs}
            activeTab={tab}
            onTabChange={(next) => setTab(next as Tab)}
        >
            {/* Sync state + exception badges (moved out of meta strip
                in Polish PR-1). Renders inline above tab content. */}
            {(syncStatus !== 'NONE' || true) && (
                <div className="flex flex-wrap gap-tight" data-testid="control-sync-banner">
                    {syncBanner}
                </div>
            )}
            {/* Applicability modal */}
            {showApplicability && permissions.canWrite && (
                <div className={cn(cardVariants({ density: 'compact' }), 'space-y-compact')}>
                    <Heading level={3}>Set Applicability</Heading>
                    <div className="flex gap-default">
                        <label className="flex items-center gap-tight text-sm text-content-default">
                            <input type="radio" value="APPLICABLE" checked={appChoice === 'APPLICABLE'} onChange={() => setAppChoice('APPLICABLE')} />
                            Applicable
                        </label>
                        <label className="flex items-center gap-tight text-sm text-content-default">
                            <input type="radio" value="NOT_APPLICABLE" checked={appChoice === 'NOT_APPLICABLE'} onChange={() => setAppChoice('NOT_APPLICABLE')} />
                            Not Applicable
                        </label>
                    </div>
                    {appChoice === 'NOT_APPLICABLE' && (
                        <textarea className="input w-full" rows={2} placeholder="Justification required..." value={appJustification} onChange={e => setAppJustification(e.target.value)} id="applicability-justification" />
                    )}
                    <Button variant="primary" onClick={saveApplicability} disabled={savingApp || (appChoice === 'NOT_APPLICABLE' && !appJustification.trim())} id="save-applicability-btn">
                        {savingApp ? 'Saving...' : 'Save'}
                    </Button>
                </div>
            )}

            {/* Tab content — tab bar is rendered by EntityDetailLayout */}
            {tab === 'overview' && (
                <div className={cn(cardVariants(), 'space-y-default')}>
                    {/* Overview header with Edit button */}
                    {permissions.canWrite && (
                        <div className="flex justify-end -mt-1 -mb-2">
                            <Button
                                variant="secondary"
                                size="icon"
                                onClick={openEditModal}
                                data-testid="control-edit-button"
                                id="control-edit-button"
                                aria-label="Edit control"
                                title="Edit control"
                            >
                                {/* B2 — icon-only edit affordance,
                                    canonical unified pattern. */}
                                <PencilIcon size={16} />
                            </Button>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-section">
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Description</span>
                            <p className="text-sm text-content-default mt-1">{control.description || 'No description.'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Intent</span>
                            <p className="text-sm text-content-default mt-1">{control.intent || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Category</span>
                            <p className="text-sm text-content-default mt-1">{control.category || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Frequency</span>
                            <p className="text-sm text-content-default mt-1">{control.frequency ? FREQ_LABELS[control.frequency] || control.frequency : '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Automation Type</span>
                            <p className="text-sm text-content-default mt-1">{control.automationType ? AUTOMATION_TYPE_LABELS[control.automationType] || control.automationType : '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Mitigation Type</span>
                            <p className="text-sm text-content-default mt-1">{control.mitigationType ? MITIGATION_TYPE_LABELS[control.mitigationType] || control.mitigationType : '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Owner</span>
                            <p className="text-sm text-content-default mt-1">{control.owner?.name || '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Tasks Progress</span>
                            <p className="text-sm text-content-default mt-1">{doneTasks}/{totalTasks} completed</p>
                        </div>
                        {control.applicability === 'NOT_APPLICABLE' && control.applicabilityJustification && (
                            <div className="col-span-2">
                                <span className="text-xs text-content-subtle uppercase">N/A Justification</span>
                                <p className="text-sm text-content-warning mt-1">{control.applicabilityJustification}</p>
                            </div>
                        )}
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Contributors</span>
                            <div className="text-sm text-content-default mt-1">
                                {(control.contributors?.length ?? 0) > 0 ? control.contributors?.map((c: ContributorDTO) => (
                                    <StatusBadge variant="neutral" className="mr-1" key={c.user.id}>{c.user.name ?? '—'}</StatusBadge>
                                )) : '—'}
                            </div>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Last Tested</span>
                            <p className="text-sm text-content-default mt-1">{control.lastTested ? formatDate(control.lastTested) : '—'}</p>
                        </div>
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Next Due</span>
                            <p className="text-sm text-content-default mt-1">{control.nextDueAt ? formatDate(control.nextDueAt) : '—'}</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Control Modal — extracted to _modals/EditControlModal.tsx
                in Elevation PR-2. Page still owns state + mutation; the
                modal is presentational. */}
            <EditControlModal
                open={showEditModal}
                setOpen={setShowEditModal}
                form={editForm}
                setForm={setEditForm}
                saving={savingEdit}
                error={editError}
                tenantSlug={tenantSlug}
                categoryOptions={CATEGORY_CB_OPTIONS}
                frequencyOptions={FREQ_CB_OPTIONS}
                onCancel={handleEditCancel}
                onSubmit={handleEditSave}
            />

            {/* Epic P2-PR-C — Where used (process maps) modal */}
            <ControlReverseLookupModal
                controlId={control.id}
                tenantSlug={tenantSlug}
                open={reverseLookupOpen}
                onOpenChange={setReverseLookupOpen}
            />

            {/* Success toast */}
            {editSuccess && (
                <div className="fixed bottom-6 right-6 z-50 bg-bg-success-emphasis text-content-emphasis px-4 py-2 rounded-lg shadow-lg animate-fadeIn text-sm" id="edit-success-toast">
                    Control updated
                </div>
            )}

            {tab === 'tasks' && (
                <div className="space-y-default">
                    {/* Unified task surface — opens the canonical
                        Tasks-page create modal. New tasks are created in
                        the global Tasks table (so they appear in the Tasks
                        list) and linked back to this control via
                        TaskLink. */}
                    <LinkedTasksPanel
                        apiBase={apiUrl('')}
                        entityType="CONTROL"
                        entityId={controlId}
                        tenantHref={tenantHref}
                        canWrite={permissions.canWrite}
                    />
                    {/* Legacy control-scoped tasks (read-only). These
                        pre-date the unified model (the old per-control
                        ControlTask table); the section only renders when
                        a control still has historical rows. */}
                    {(tasksSWR.data?.length ?? 0) > 0 && (
                        <div className={cn(cardVariants({ density: 'compact' }), 'mt-4')} id="legacy-control-tasks-section">
                            <CardHeader title="Control tasks (legacy)" className="mb-3" />
                            <DataTable
                                data={tasksSWR.data ?? []}
                                columns={controlTaskColumns}
                                getRowId={(t) => t.id}
                                resourceName={(p) => (p ? 'tasks' : 'task')}
                                data-testid="control-tasks-table"
                            />
                        </div>
                    )}
                </div>
            )}

            {tab === 'evidence' && (
                <div className="space-y-default">
                    {permissions.canWrite && (
                        <div className="flex justify-end">
                            <Button variant="primary" onClick={() => { setShowEvidenceForm(!showEvidenceForm); setFileUploadError(''); }} id="link-evidence-btn">
                                + Evidence
                            </Button>
                        </div>
                    )}
                    {/* Unified add-evidence form — upload a file (browse +
                        title) OR link a URL. A chosen file takes precedence
                        (the URL fields disable). Either way the evidence is
                        attached to this control + the Evidence Library. */}
                    {showEvidenceForm && permissions.canWrite && (
                        <form onSubmit={addEvidence} className={cn(cardVariants({ density: 'compact' }), 'space-y-default')} id="control-evidence-form">
                            <div className="space-y-compact">
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-content-muted" htmlFor="control-upload-title">Title</label>
                                    <input
                                        type="text"
                                        className="input w-full"
                                        placeholder="Title (defaults to filename)"
                                        value={fileUploadTitle}
                                        onChange={e => setFileUploadTitle(e.target.value)}
                                        id="control-upload-title"
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-xs font-medium text-content-muted" htmlFor="control-file-input">Upload a file</label>
                                    <input
                                        ref={fileUploadRef}
                                        type="file"
                                        className="input w-full file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[var(--brand-default)] file:text-content-emphasis hover:file:bg-[var(--brand-default)]"
                                        onChange={e => setFileToUpload(e.target.files?.[0] || null)}
                                        id="control-file-input"
                                        accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.doc,.docx,.xlsx,.xls,.json,.zip"
                                    />
                                    {fileToUpload && (
                                        <p className="mt-1 text-xs text-content-muted">{fileToUpload.name} ({fileToUpload.size < 1048576 ? `${(fileToUpload.size / 1024).toFixed(1)} KB` : `${(fileToUpload.size / 1048576).toFixed(1)} MB`})</p>
                                    )}
                                </div>
                            </div>
                            <div className="space-y-compact border-t border-border-subtle pt-3">
                                <label className="block text-xs font-medium text-content-muted" htmlFor="evidence-url-input">…or link a URL</label>
                                <input type="url" className="input w-full" placeholder="https://…" value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} id="evidence-url-input" disabled={!!fileToUpload} />
                                <textarea className="input w-full" rows={2} placeholder="Note (optional)" value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} id="evidence-note-input" disabled={!!fileToUpload} />
                            </div>
                            {fileUploadError && (
                                <div className="text-content-error text-sm bg-bg-error rounded px-3 py-2" id="control-evidence-error">{fileUploadError}</div>
                            )}
                            {fileUploading && (
                                // Epic 59 — ProgressBar primitive. The upload is
                                // XHR-bounded so we show a stable 60% "working"
                                // signal; the ARIA value stays correct for AT.
                                <ProgressBar value={60} size="md" variant="brand" aria-label="Uploading evidence file" />
                            )}
                            <Button type="submit" variant="primary" disabled={fileUploading || savingEvidence || (!fileToUpload && !evidenceUrl.trim())} id="submit-evidence-btn">
                                {fileUploading ? 'Uploading...' : savingEvidence ? 'Linking...' : 'Add Evidence'}
                            </Button>
                        </form>
                    )}
                    <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                        {evidenceSWR.error ? (
                            <InlineEmptyState
                                title="Couldn't load evidence"
                                description="Something went wrong fetching this control's evidence. Reload the page to try again."
                            />
                        ) : (
                            <EvidenceSubTable
                                data={evidenceSWR.data}
                                loading={evidenceSWR.isLoading && !evidenceSWR.data}
                                canWrite={permissions.canWrite}
                                onUnlink={unlinkEvidence}
                                tenantHref={tenantHref}
                            />
                        )}
                    </div>
                </div>
            )}

            {tab === 'mappings' && (
                <ControlMappingsTab
                    controlId={controlId}
                    canWrite={permissions.canWrite}
                    onMutated={refetch}
                />
            )}

            {tab === 'traceability' && (
                <TraceabilityPanel
                    apiBase={apiUrl('')}
                    entityType="control"
                    entityId={controlId}
                    canWrite={permissions.canWrite}
                    tenantHref={tenantHref}
                />
            )}

            {tab === 'activity' && (
                <div className={cn(cardVariants({ density: 'none' }), 'overflow-hidden')}>
                    {activityLoading ? (
                        <div className="p-8 text-center text-content-subtle animate-pulse">Loading activity…</div>
                    ) : activity.length === 0 ? (
                        <InlineEmptyState
                            title="No activity recorded"
                            description="Status changes, link updates, and edits show up here once anything moves."
                        />
                    ) : (
                        <div className="divide-y divide-border-default/50" id="activity-feed">
                            {activity.map((ev: AuditLogEntry) => (
                                <div key={ev.id} className="px-5 py-3 flex items-start gap-compact">
                                    <div className="mt-0.5">
                                        <StatusBadge variant="info">{EVENT_LABELS[ev.action] || ev.action}</StatusBadge>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm text-content-default">{ev.details}</p>
                                        <p className="text-xs text-content-subtle mt-0.5">
                                            {ev.user?.name || 'System'} · {formatDateTime(ev.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {tab === 'tests' && (
                <div className={cardVariants({ density: 'compact' })}>
                    <TestPlansPanel controlId={controlId} />
                </div>
            )}

            {/* Epic G-5 — Control exceptions section. Scoped to the
              * Overview tab only: the request-exception workflow is
              * control-level metadata, not per-sub-tab, so it would
              * read as noise repeated under Tasks / Evidence / etc. */}
            {tab === 'overview' && (
                <div className={cn(cardVariants({ density: 'compact' }), 'mt-6')}>
                    <ControlExceptionsPanel
                        tenantSlug={tenantSlug}
                        controlId={controlId}
                        compensatingControlChoices={[]}
                        defaultRiskAcceptedByUserId={control.ownerUserId ?? ''}
                        canWrite={permissions.canWrite}
                        canAdmin={permissions.canAdmin}
                    />
                </div>
            )}
        </EntityDetailLayout>
    );
}

// Evidence sub-table is extracted to `_tabs/EvidenceSubTable.tsx`
// per the page-size ratchet (R10-PR3 follow-up).

// Evidence sub-table extracted; see _tabs/EvidenceSubTable.tsx.
