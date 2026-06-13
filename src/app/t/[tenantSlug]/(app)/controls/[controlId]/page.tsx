'use client';
import { formatDate, formatDateTime } from '@/lib/format-date';
import { useEffect, useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/queryKeys';
import { useParams } from 'next/navigation';
import Link from 'next/link';
// Inline pencil icon to avoid lucide-react barrel import issue with Next.js 14
const PencilIcon = ({ size = 14 }: { size?: number }) => (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
);
import { useTenantApiUrl, useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { extractMutationError } from '@/lib/mutations';
import { Modal } from '@/components/ui/modal';
import { Combobox, ComboboxOption } from '@/components/ui/combobox';
import { Tooltip } from '@/components/ui/tooltip';
import { CopyText } from '@/components/ui/copy-text';
import { ProgressBar } from '@/components/ui/progress-bar';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import {
    parseYMD,
    startOfUtcDay,
    toYMD,
} from '@/components/ui/date-picker/date-utils';
import dynamic from 'next/dynamic';
import { EntityDetailLayout } from '@/components/layout/EntityDetailLayout';

const TraceabilityPanel = dynamic(() => import('@/components/TraceabilityPanel'), {
    loading: () => <div className="glass-card p-6 animate-pulse h-48" aria-busy="true" />,
    ssr: false,
});
const TestPlansPanel = dynamic(() => import('@/components/TestPlansPanel'), {
    loading: () => <div className="glass-card p-6 animate-pulse h-48" aria-busy="true" />,
    ssr: false,
});
const LinkedTasksPanel = dynamic(() => import('@/components/LinkedTasksPanel'), {
    loading: () => <div className="glass-card p-6 animate-pulse h-48" aria-busy="true" />,
    ssr: false,
});
import type {
    ControlDetailDTO, ControlTaskDTO, EvidenceLinkDTO,
    FrameworkMappingDTO, ContributorDTO, AuditLogEntry,
} from '@/lib/dto';
import type { FrameworkDTO, RequirementDTO } from '@/lib/dto';

const STATUS_BADGE: Record<string, string> = {
    NOT_STARTED: 'badge-neutral', IN_PROGRESS: 'badge-info', IMPLEMENTED: 'badge-success',
    NEEDS_REVIEW: 'badge-warning',
};
const STATUS_LABELS: Record<string, string> = {
    NOT_STARTED: 'Not Started', IN_PROGRESS: 'In Progress', IMPLEMENTED: 'Implemented',
    NEEDS_REVIEW: 'Needs Review',
};
const TASK_STATUS_BADGE: Record<string, string> = {
    OPEN: 'badge-neutral', IN_PROGRESS: 'badge-info', DONE: 'badge-success', BLOCKED: 'badge-danger',
};
const FREQ_LABELS: Record<string, string> = {
    AD_HOC: 'Ad Hoc', DAILY: 'Daily', WEEKLY: 'Weekly',
    MONTHLY: 'Monthly', QUARTERLY: 'Quarterly', ANNUALLY: 'Annually',
};
const FREQ_OPTIONS = ['', 'AD_HOC', 'DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY'];
const FREQ_CB_OPTIONS: ComboboxOption[] = FREQ_OPTIONS.filter(Boolean).map(f => ({ value: f, label: FREQ_LABELS[f] || f }));
const CATEGORY_OPTIONS = ['', 'ORGANIZATIONAL', 'PEOPLE', 'PHYSICAL', 'TECHNOLOGICAL'];
const CATEGORY_LABELS: Record<string, string> = {
    ORGANIZATIONAL: 'Organizational', PEOPLE: 'People', PHYSICAL: 'Physical', TECHNOLOGICAL: 'Technological',
};
const CATEGORY_CB_OPTIONS: ComboboxOption[] = CATEGORY_OPTIONS.filter(Boolean).map(c => ({ value: c, label: CATEGORY_LABELS[c] || c }));
const STATUS_CB_OPTIONS: ComboboxOption[] = Object.entries(STATUS_LABELS).map(([val, lbl]) => ({ value: val, label: lbl }));
const EVIDENCE_SOURCE_OPTIONS: ComboboxOption[] = [
    { value: 'MANUAL', label: 'Manual' },
    { value: 'INTEGRATION', label: 'Integration' },
];

type Tab = 'overview' | 'tasks' | 'evidence' | 'mappings' | 'traceability' | 'activity' | 'tests';

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
    const queryClient = useQueryClient();

    // ─── Query: control + sync (single page-data call) ───
    //
    // Hits `/controls/:id/page-data` which collapses the previous
    // serial waterfall (GET /controls/:id THEN GET /controls/:id/sync)
    // into one round-trip. The sync sub-payload is null for controls
    // without an automationKey, or when the mapping lookup fails — the
    // page renders the conflict badge unconditionally against it.
    interface ControlPageDataDTO {
        control: ControlDetailDTO;
        syncStatus: {
            syncStatus: string | null;
            lastSyncedAt: string | null;
            errorMessage: string | null;
            provider: string | null;
        } | null;
    }
    const pageDataQuery = useQuery<ControlPageDataDTO>({
        queryKey: queryKeys.controls.detail(tenantSlug, controlId),
        queryFn: async () => {
            const res = await fetch(apiUrl(`/controls/${controlId}/page-data`));
            if (!res.ok) throw new Error('Control not found');
            return res.json();
        },
        enabled: !!controlId,
    });
    const control = pageDataQuery.data?.control ?? null;
    const loading = pageDataQuery.isLoading;
    const error = pageDataQuery.error?.message ?? '';
    const refetch = pageDataQuery.refetch;
    const initialSyncStatus = pageDataQuery.data?.syncStatus ?? null;
    const [tab, setTab] = useState<Tab>('overview');

    // Status change
    const [changingStatus, setChangingStatus] = useState(false);

    // Applicability
    const [showApplicability, setShowApplicability] = useState(false);
    const [appChoice, setAppChoice] = useState('APPLICABLE');
    const [appJustification, setAppJustification] = useState('');
    const [savingApp, setSavingApp] = useState(false);

    // Task creation
    const [showTaskForm, setShowTaskForm] = useState(false);
    const [taskTitle, setTaskTitle] = useState('');
    const [taskDesc, setTaskDesc] = useState('');
    const [taskDue, setTaskDue] = useState('');
    const [savingTask, setSavingTask] = useState(false);

    // Evidence linking
    const [showEvidenceForm, setShowEvidenceForm] = useState(false);
    const [evidenceUrl, setEvidenceUrl] = useState('');
    const [evidenceNote, setEvidenceNote] = useState('');
    const [savingEvidence, setSavingEvidence] = useState(false);

    // File upload for this control
    const [showFileUpload, setShowFileUpload] = useState(false);
    const [fileToUpload, setFileToUpload] = useState<File | null>(null);
    const [fileUploadTitle, setFileUploadTitle] = useState('');
    const [fileUploading, setFileUploading] = useState(false);
    const [fileUploadError, setFileUploadError] = useState('');
    const fileUploadRef = useRef<HTMLInputElement>(null);

    // Mapping
    const [showMapForm, setShowMapForm] = useState(false);
    const [frameworks, setFrameworks] = useState<FrameworkDTO[]>([]);
    const [selectedFramework, setSelectedFramework] = useState('');
    const [requirements, setRequirements] = useState<RequirementDTO[]>([]);
    const [selectedReq, setSelectedReq] = useState('');
    const [savingMap, setSavingMap] = useState(false);

    // Activity trail
    const [activity, setActivity] = useState<AuditLogEntry[]>([]);
    const [activityLoading, setActivityLoading] = useState(false);

    // Test completed
    const [markingTest, setMarkingTest] = useState(false);

    // Automation
    const [editingAutomation, setEditingAutomation] = useState(false);
    const [autoEvidenceSource, setAutoEvidenceSource] = useState('');
    const [autoKey, setAutoKey] = useState('');
    const [savingAutomation, setSavingAutomation] = useState(false);

    // Sync status (conflict badge + Sync Now)
    const [syncStatus, setSyncStatus] = useState<string | null>(null);
    const [syncLastAt, setSyncLastAt] = useState<string | null>(null);
    const [syncError, setSyncError] = useState<string | null>(null);
    const [syncing, setSyncing] = useState(false);
    const [syncResult, setSyncResult] = useState<{ status: string; summary?: string } | null>(null);

    // Edit modal state
    const [showEditModal, setShowEditModal] = useState(false);
    const [editForm, setEditForm] = useState({ name: '', description: '', intent: '', category: '', frequency: '', owner: '' });
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
        });
        setEditError('');
        setEditSuccess(false);
        setShowEditModal(true);
    };


    // ─── Mutation: edit control ───
    const editMutation = useMutation({
        mutationFn: async (form: typeof editForm) => {
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
                const err = await res.json().catch(() => ({ error: 'Update failed' }));
                throw new Error(extractMutationError(err, 'Update failed'));
            }
            // If owner changed, call the separate owner endpoint
            const originalOwner = control?.ownerUserId || '';
            if (form.owner.trim() !== originalOwner) {
                const ownerRes = await fetch(apiUrl(`/controls/${controlId}/owner`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerUserId: form.owner.trim() || null }),
                });
                if (!ownerRes.ok) {
                    const ownerErr = await ownerRes.json().catch(() => ({ error: 'Owner update failed' }));
                    throw new Error(extractMutationError(ownerErr, 'Owner update failed'));
                }
            }
            return form;
        },
        onMutate: async (form) => {
            await queryClient.cancelQueries({ queryKey: queryKeys.controls.detail(tenantSlug, controlId) });
            const previous = queryClient.getQueryData<ControlDetailDTO>(queryKeys.controls.detail(tenantSlug, controlId));
            if (previous) {
                queryClient.setQueryData<ControlDetailDTO>(queryKeys.controls.detail(tenantSlug, controlId), {
                    ...previous,
                    name: form.name.trim(),
                    description: form.description.trim() || null,
                    intent: form.intent.trim() || null,
                    category: form.category.trim() || null,
                    frequency: form.frequency || null,
                });
            }
            return { previous };
        },
        onError: (_err, _vars, context) => {
            if (context?.previous) {
                queryClient.setQueryData(queryKeys.controls.detail(tenantSlug, controlId), context.previous);
            }
        },
        onSuccess: () => {
            setShowEditModal(false);
            setEditSuccess(true);
            setTimeout(() => setEditSuccess(false), 3000);
        },
        onSettled: () => {
            queryClient.invalidateQueries({ queryKey: queryKeys.controls.all(tenantSlug) });
            setSavingEdit(false);
        },
    });

    const handleEditSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editForm.name || editForm.name.trim().length < 3) {
            setEditError('Title must be at least 3 characters.');
            return;
        }
        setSavingEdit(true);
        setEditError('');
        editMutation.mutate(editForm, {
            onError: (err) => {
                setEditError(err instanceof Error ? err.message : 'Update failed');
            },
        });
    };

    const handleEditCancel = () => {
        setShowEditModal(false);
        setEditError('');
    };

    // Fetch frameworks when mapping tab opens
    useEffect(() => {
        if (tab !== 'mappings') return;
        fetch(apiUrl('/controls/frameworks')).then(r => r.ok ? r.json() : []).then(setFrameworks).catch(() => { });
    }, [tab, apiUrl]);

    // Fetch requirements when framework selected
    useEffect(() => {
        if (!selectedFramework) { setRequirements([]); return; }
        fetch(apiUrl(`/controls/frameworks/${selectedFramework}/requirements`))
            .then(r => r.ok ? r.json() : []).then(setRequirements).catch(() => { });
    }, [selectedFramework, apiUrl]);

    // Fetch activity when activity tab opens
    useEffect(() => {
        if (tab !== 'activity') return;
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
            setSyncStatus(null);
            setSyncLastAt(null);
            setSyncError(null);
            return;
        }
        setSyncStatus(initialSyncStatus.syncStatus ?? null);
        setSyncLastAt(initialSyncStatus.lastSyncedAt ?? null);
        setSyncError(initialSyncStatus.errorMessage ?? null);
    }, [initialSyncStatus]);

    const handleSyncNow = async () => {
        setSyncing(true);
        setSyncResult(null);
        try {
            const res = await fetch(apiUrl(`/controls/${controlId}/sync`), { method: 'POST' });
            const data = await res.json();
            if (res.ok && data.execution) {
                setSyncResult({ status: data.execution.status, summary: data.execution.summary });
                // One refetch — the page-data payload re-runs the
                // sync-mapping lookup server-side, so we get the
                // post-sync status without a second round-trip. The
                // useEffect on `initialSyncStatus` writes the new
                // values into the badge state.
                await refetch();
            } else {
                setSyncResult({ status: 'ERROR', summary: data.error || 'Sync failed' });
            }
        } catch {
            setSyncResult({ status: 'ERROR', summary: 'Network error' });
        }
        setSyncing(false);
    };

    const handleMarkTestCompleted = async () => {
        setMarkingTest(true);
        await fetch(apiUrl(`/controls/${controlId}/test-completed`), { method: 'POST' });
        await refetch();
        setMarkingTest(false);
    };

    const saveAutomation = async () => {
        setSavingAutomation(true);
        await fetch(apiUrl(`/controls/${controlId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ evidenceSource: autoEvidenceSource || null, automationKey: autoKey || null }),
        });
        await refetch();
        setSavingAutomation(false);
        setEditingAutomation(false);
    };

    const changeStatus = async (status: string) => {
        setChangingStatus(true);
        await fetch(apiUrl(`/controls/${controlId}/status`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await refetch();
        queryClient.invalidateQueries({ queryKey: queryKeys.controls.list(tenantSlug) });
        setChangingStatus(false);
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

    const createTask = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingTask(true);
        await fetch(apiUrl(`/controls/${controlId}/tasks`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: taskTitle, description: taskDesc || undefined, dueAt: taskDue || undefined }),
        });
        setTaskTitle(''); setTaskDesc(''); setTaskDue('');
        setShowTaskForm(false);
        await refetch();
        setSavingTask(false);
    };

    const updateTaskStatus = async (taskId: string, status: string) => {
        await fetch(apiUrl(`/controls/tasks/${taskId}`), {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status }),
        });
        await refetch();
    };

    const linkEvidence = async (e: React.FormEvent) => {
        e.preventDefault();
        setSavingEvidence(true);
        await fetch(apiUrl(`/controls/${controlId}/evidence`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ kind: 'LINK', url: evidenceUrl, note: evidenceNote || undefined }),
        });
        setEvidenceUrl(''); setEvidenceNote('');
        setShowEvidenceForm(false);
        await refetch();
        setSavingEvidence(false);
    };

    const unlinkEvidence = async (linkId: string) => {
        await fetch(apiUrl(`/controls/${controlId}/evidence/${linkId}`), { method: 'DELETE' });
        await refetch();
    };

    const handleFileUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!fileToUpload) return;
        setFileUploading(true);
        setFileUploadError('');
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
            setFileToUpload(null);
            setFileUploadTitle('');
            setShowFileUpload(false);
            if (fileUploadRef.current) fileUploadRef.current.value = '';
            await refetch();
        } catch (err: unknown) {
            setFileUploadError(err instanceof Error ? err.message : 'Upload failed');
        } finally {
            setFileUploading(false);
        }
    };

    const mapRequirement = async () => {
        if (!selectedReq) return;
        setSavingMap(true);
        await fetch(apiUrl(`/controls/${controlId}/requirements`), {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: selectedReq }),
        });
        setSelectedReq('');
        setShowMapForm(false);
        await refetch();
        setSavingMap(false);
    };

    const unmapRequirement = async (reqId: string) => {
        await fetch(apiUrl(`/controls/${controlId}/requirements`), {
            method: 'DELETE', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requirementId: reqId }),
        });
        await refetch();
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

    const doneTasks = control.controlTasks?.filter((t: ControlTaskDTO) => t.status === 'DONE').length ?? 0;
    const totalTasks = control.controlTasks?.length ?? 0;
    const tabs: { key: Tab; label: string; count?: number }[] = [
        { key: 'overview', label: 'Overview' },
        { key: 'tasks', label: 'Tasks', count: totalTasks },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { key: 'evidence', label: 'Evidence', count: (control.evidenceLinks?.length ?? 0) + ((control.evidence ?? []).filter((e: any) => !e.fileRecordId || !control.evidenceLinks?.some((l: EvidenceLinkDTO) => l.fileId === e.fileRecordId)).length) },
        { key: 'mappings', label: 'Mappings', count: control.frameworkMappings?.length ?? 0 },
        { key: 'traceability', label: 'Traceability' },
        { key: 'activity', label: 'Activity' },
        { key: 'tests', label: 'Tests' },
    ];

    // ── Header meta (badges) ──
    //
    // Domain-specific metadata row. The shell renders this as its
    // `meta` slot so layout/spacing/wrapping is consistent across
    // detail pages while the badges themselves stay specific to
    // controls (status, applicability, sync state).
    const headerMeta = (
        <>
            {control.code && (
                <CopyText
                    value={control.code}
                    label={`Copy control code ${control.code}`}
                    successMessage="Control code copied"
                    className="text-xs text-content-subtle"
                >
                    {control.code}
                </CopyText>
            )}
            <span className={`badge ${STATUS_BADGE[control.status] || 'badge-neutral'}`} id="control-status">
                {STATUS_LABELS[control.status] || control.status}
            </span>
            <span className={`badge ${control.applicability === 'NOT_APPLICABLE' ? 'badge-warning' : 'badge-success'}`} id="control-applicability">
                {control.applicability === 'NOT_APPLICABLE' ? 'Not Applicable' : 'Applicable'}
            </span>
            {syncStatus === 'CONFLICT' && (
                <Tooltip
                    title="Sync conflict"
                    content={syncError ?? 'Local and remote state diverged — resolve before editing.'}
                >
                    <span
                        className="badge badge-error flex items-center gap-1 animate-pulse cursor-help"
                        id="sync-conflict-badge"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
                        Sync Conflict
                    </span>
                </Tooltip>
            )}
            {syncStatus === 'FAILED' && (
                <Tooltip
                    title="Last sync failed"
                    content={syncError ?? 'The integration could not reach the source system.'}
                >
                    <span
                        className="badge badge-error flex items-center gap-1 cursor-help"
                        id="sync-failed-badge"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>
                        Sync Failed
                    </span>
                </Tooltip>
            )}
            {syncStatus === 'SYNCED' && (
                <Tooltip content={syncLastAt ? `Last synced: ${formatDateTime(syncLastAt)}` : 'Synced'}>
                    <span className="badge badge-success flex items-center gap-1 cursor-help" id="sync-ok-badge">
                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                        Synced
                    </span>
                </Tooltip>
            )}
        </>
    );

    // ── Header actions (right side) ──
    const headerActions = permissions.canWrite ? (
        <>
            <Combobox
                hideSearch
                id="control-status-select"
                selected={STATUS_CB_OPTIONS.find(o => o.value === control.status) ?? null}
                setSelected={(opt) => { if (opt) changeStatus(opt.value); }}
                options={STATUS_CB_OPTIONS}
                disabled={changingStatus}
                placeholder="Status"
                matchTriggerWidth
                buttonProps={{ className: 'w-40 text-sm' }}
            />
            <button className="btn btn-secondary" onClick={() => { setAppChoice(control.applicability); setAppJustification(control.applicabilityJustification || ''); setShowApplicability(!showApplicability); }} id="toggle-applicability-btn">
                Applicability
            </button>
            {control.applicability !== 'NOT_APPLICABLE' && (
                <button className="btn btn-primary" onClick={handleMarkTestCompleted} disabled={markingTest} id="mark-test-completed-btn">
                    {markingTest ? '...' : 'Mark Test Completed'}
                </button>
            )}
        </>
    ) : null;

    return (
        <EntityDetailLayout
            id="control-detail-page"
            back={{ smart: true }}
            title={<span id="control-title">{control.name}</span>}
            meta={headerMeta}
            actions={headerActions}
            tabs={tabs}
            activeTab={tab}
            onTabChange={(next) => setTab(next as Tab)}
        >
            {/* Applicability modal */}
            {showApplicability && permissions.canWrite && (
                <div className="glass-card p-4 space-y-3">
                    <h3 className="text-sm font-semibold">Set Applicability</h3>
                    <div className="flex gap-4">
                        <label className="flex items-center gap-2 text-sm text-content-default">
                            <input type="radio" value="APPLICABLE" checked={appChoice === 'APPLICABLE'} onChange={() => setAppChoice('APPLICABLE')} />
                            Applicable
                        </label>
                        <label className="flex items-center gap-2 text-sm text-content-default">
                            <input type="radio" value="NOT_APPLICABLE" checked={appChoice === 'NOT_APPLICABLE'} onChange={() => setAppChoice('NOT_APPLICABLE')} />
                            Not Applicable
                        </label>
                    </div>
                    {appChoice === 'NOT_APPLICABLE' && (
                        <textarea className="input w-full" rows={2} placeholder="Justification required..." value={appJustification} onChange={e => setAppJustification(e.target.value)} id="applicability-justification" />
                    )}
                    <button onClick={saveApplicability} disabled={savingApp || (appChoice === 'NOT_APPLICABLE' && !appJustification.trim())} className="btn btn-primary" id="save-applicability-btn">
                        {savingApp ? 'Saving...' : 'Save'}
                    </button>
                </div>
            )}

            {/* Tab content — tab bar is rendered by EntityDetailLayout */}
            {tab === 'overview' && (
                <div className="glass-card p-6 space-y-4">
                    {/* Overview header with Edit button */}
                    {permissions.canWrite && (
                        <div className="flex justify-end -mt-1 -mb-2">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={openEditModal}
                                data-testid="control-edit-button"
                                id="control-edit-button"
                            >
                                <PencilIcon size={14} />
                                Edit
                            </button>
                        </div>
                    )}
                    <div className="grid grid-cols-2 gap-6">
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
                                <p className="text-sm text-yellow-400 mt-1">{control.applicabilityJustification}</p>
                            </div>
                        )}
                        <div>
                            <span className="text-xs text-content-subtle uppercase">Contributors</span>
                            <div className="text-sm text-content-default mt-1">
                                {(control.contributors?.length ?? 0) > 0 ? control.contributors?.map((c: ContributorDTO) => (
                                    <span key={c.user.id} className="badge badge-neutral text-xs mr-1">{c.user.name ?? '—'}</span>
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
                    {/* Automation Section */}
                    <div className="border-t border-border-default pt-4 mt-4">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold text-content-default">Automation</h3>
                            <div className="flex items-center gap-2">
                                {/* Sync Now button — only when automationKey is set */}
                                {control.automationKey && permissions.canWrite && !editingAutomation && (
                                    <Tooltip content="Manually trigger a sync check against the source system.">
                                        <button
                                            className="btn btn-secondary btn-xs flex items-center gap-1 disabled:opacity-50"
                                            onClick={handleSyncNow}
                                            disabled={syncing}
                                            id="sync-now-btn"
                                        >
                                            {syncing ? (
                                                <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                                            ) : (
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                                            )}
                                            {syncing ? 'Syncing…' : 'Sync Now'}
                                        </button>
                                    </Tooltip>
                                )}
                                {permissions.canWrite && (
                                    <button className="text-xs text-[var(--brand-default)] hover:underline" onClick={() => { setAutoEvidenceSource(control.evidenceSource || ''); setAutoKey(control.automationKey || ''); setEditingAutomation(!editingAutomation); }} id="edit-automation-btn">
                                        {editingAutomation ? 'Cancel' : 'Edit'}
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Sync result flash */}
                        {syncResult && (
                            <div className={`mb-3 p-2.5 rounded text-xs flex items-start gap-2 ${
                                syncResult.status === 'PASSED' ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400'
                                : syncResult.status === 'FAILED' || syncResult.status === 'ERROR' ? 'bg-red-500/10 border border-red-500/30 text-red-400'
                                : 'bg-bg-elevated/50 border border-border-emphasis text-content-default'
                            }`} id="sync-result-banner">
                                <span className="font-semibold">{syncResult.status}</span>
                                {syncResult.summary && <span className="opacity-80">{syncResult.summary}</span>}
                            </div>
                        )}

                        {editingAutomation && permissions.canWrite ? (
                            <div className="space-y-2">
                                <Combobox
                                    hideSearch
                                    id="evidence-source-select"
                                    selected={EVIDENCE_SOURCE_OPTIONS.find(o => o.value === autoEvidenceSource) ?? null}
                                    setSelected={(opt) => setAutoEvidenceSource(opt?.value ?? '')}
                                    options={EVIDENCE_SOURCE_OPTIONS}
                                    placeholder="No source"
                                    matchTriggerWidth
                                />
                                {autoEvidenceSource === 'INTEGRATION' && (
                                    <input type="text" className="input w-full" placeholder="Automation key (e.g. aws-cis-1.2)" value={autoKey} onChange={e => setAutoKey(e.target.value)} id="automation-key-input" />
                                )}
                                <button onClick={saveAutomation} disabled={savingAutomation} className="btn btn-primary" id="save-automation-btn">
                                    {savingAutomation ? 'Saving...' : 'Save'}
                                </button>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <span className="text-xs text-content-subtle">Evidence Source</span>
                                    <p className="text-sm text-content-default mt-1">{control.evidenceSource || '—'}</p>
                                </div>
                                <div>
                                    <span className="text-xs text-content-subtle">Automation Key</span>
                                    <p className="text-sm text-content-default mt-1 font-mono">{control.automationKey || '—'}</p>
                                </div>
                                {syncStatus && (
                                    <div>
                                        <span className="text-xs text-content-subtle">Sync Status</span>
                                        <div className="mt-1 flex items-center gap-1.5">
                                            <span className={`badge text-xs ${
                                                syncStatus === 'SYNCED' ? 'badge-success'
                                                : syncStatus === 'CONFLICT' ? 'badge-error'
                                                : syncStatus === 'FAILED' ? 'badge-error'
                                                : syncStatus === 'STALE' ? 'badge-warning'
                                                : 'badge-neutral'
                                            }`}>{syncStatus}</span>
                                            {syncLastAt && (
                                                <span className="text-xs text-content-subtle">{formatDateTime(syncLastAt)}</span>
                                            )}
                                        </div>
                                        {syncError && syncStatus !== 'SYNCED' && (
                                            <p className="text-xs text-red-400 mt-1 truncate" title={syncError}>{syncError}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Edit Control Modal — migrated to the shared <Modal> (Epic 54) */}
            <Modal
                showModal={showEditModal}
                setShowModal={(v) => {
                    const next = typeof v === 'function' ? v(showEditModal) : v;
                    if (!next && !savingEdit) handleEditCancel();
                }}
                size="lg"
                title="Edit Control"
                description="Update the control's metadata."
                preventDefaultClose={savingEdit}
            >
                <Modal.Header title="Edit Control" description="Update the control's metadata." />
                <Modal.Form onSubmit={handleEditSave} id="control-edit-dialog" data-testid="control-edit-dialog">
                    <Modal.Body>
                        {editError && (
                            <div
                                className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                                role="alert"
                                data-testid="edit-error"
                            >
                                {editError}
                            </div>
                        )}
                        <fieldset className="space-y-4" disabled={savingEdit}>
                            <div>
                                <label htmlFor="edit-name" className="mb-1 block text-sm text-content-default">
                                    Title <span className="text-content-error">*</span>
                                </label>
                                <input
                                    id="edit-name"
                                    type="text"
                                    className="input w-full"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))}
                                    required
                                    minLength={3}
                                    data-testid="edit-name-input"
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-description" className="mb-1 block text-sm text-content-default">
                                    Description
                                </label>
                                <textarea
                                    id="edit-description"
                                    className="input w-full"
                                    rows={3}
                                    value={editForm.description}
                                    onChange={(e) => setEditForm((f) => ({ ...f, description: e.target.value }))}
                                    data-testid="edit-description-input"
                                />
                            </div>
                            <div>
                                <label htmlFor="edit-intent" className="mb-1 block text-sm text-content-default">
                                    Intent
                                </label>
                                <textarea
                                    id="edit-intent"
                                    className="input w-full"
                                    rows={2}
                                    value={editForm.intent}
                                    onChange={(e) => setEditForm((f) => ({ ...f, intent: e.target.value }))}
                                    data-testid="edit-intent-input"
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                <div>
                                    <label htmlFor="edit-category" className="mb-1 block text-sm text-content-default">
                                        Category
                                    </label>
                                    <Combobox
                                        hideSearch
                                        forceDropdown
                                        id="edit-category"
                                        selected={CATEGORY_CB_OPTIONS.find(o => o.value === editForm.category) ?? null}
                                        setSelected={(opt) => setEditForm((f) => ({ ...f, category: opt?.value ?? '' }))}
                                        options={CATEGORY_CB_OPTIONS}
                                        placeholder="— None —"
                                        matchTriggerWidth
                                    />
                                </div>
                                <div>
                                    <label htmlFor="edit-frequency" className="mb-1 block text-sm text-content-default">
                                        Frequency
                                    </label>
                                    <Combobox
                                        hideSearch
                                        forceDropdown
                                        id="edit-frequency"
                                        selected={FREQ_CB_OPTIONS.find(o => o.value === editForm.frequency) ?? null}
                                        setSelected={(opt) => setEditForm((f) => ({ ...f, frequency: opt?.value ?? '' }))}
                                        options={FREQ_CB_OPTIONS}
                                        placeholder="— None —"
                                        matchTriggerWidth
                                    />
                                </div>
                            </div>
                            <div>
                                <label htmlFor="edit-owner" className="mb-1 block text-sm text-content-default">
                                    Owner
                                </label>
                                <input
                                    id="edit-owner"
                                    type="text"
                                    className="input w-full"
                                    placeholder="User ID (leave empty to clear)"
                                    value={editForm.owner}
                                    onChange={(e) => setEditForm((f) => ({ ...f, owner: e.target.value }))}
                                    data-testid="edit-owner-input"
                                />
                                {control?.owner?.name && (
                                    <p className="mt-1 text-xs text-content-muted">Current: {control.owner.name}</p>
                                )}
                            </div>
                        </fieldset>
                    </Modal.Body>
                    <Modal.Actions>
                        <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            onClick={handleEditCancel}
                            disabled={savingEdit}
                            data-testid="edit-cancel-button"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="btn btn-primary btn-sm"
                            disabled={savingEdit || editForm.name.trim().length < 3}
                            data-testid="edit-save-button"
                        >
                            {savingEdit ? 'Saving...' : 'Save'}
                        </button>
                    </Modal.Actions>
                </Modal.Form>
            </Modal>

            {/* Success toast */}
            {editSuccess && (
                <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-content-emphasis px-4 py-2 rounded-lg shadow-lg animate-fadeIn text-sm" id="edit-success-toast">
                    Control updated
                </div>
            )}

            {tab === 'tasks' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary" onClick={() => setShowTaskForm(!showTaskForm)} id="create-task-btn">
                                + Create Task
                            </button>
                        </div>
                    )}
                    {showTaskForm && permissions.canWrite && (
                        <form onSubmit={createTask} className="glass-card p-4 space-y-3">
                            <input type="text" className="input w-full" placeholder="Task title *" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} required id="task-title-input" />
                            <textarea className="input w-full" rows={2} placeholder="Description (optional)" value={taskDesc} onChange={e => setTaskDesc(e.target.value)} id="task-desc-input" />
                            {/* Epic 58 — shared DatePicker. `taskDue`
                                keeps its YMD-string shape. */}
                            <DatePicker
                                id="task-due-input"
                                className="w-full"
                                placeholder="Due date"
                                clearable
                                align="start"
                                value={parseYMD(taskDue)}
                                onChange={(next) => setTaskDue(toYMD(next) ?? '')}
                                disabledDays={{
                                    before: startOfUtcDay(new Date()),
                                }}
                                aria-label="Task due date"
                            />
                            <button type="submit" disabled={savingTask} className="btn btn-primary" id="submit-task-btn">
                                {savingTask ? 'Creating...' : 'Create'}
                            </button>
                        </form>
                    )}
                    <div className="glass-card overflow-hidden">
                        {(control.controlTasks?.length ?? 0) === 0 ? (
                            <div className="p-8 text-center text-content-subtle text-sm">No tasks yet</div>
                        ) : (
                            <table className="data-table" id="tasks-table">
                                <thead>
                                    <tr><th>Title</th><th>Status</th><th>Assignee</th><th>Due</th>{permissions.canWrite && <th>Actions</th>}</tr>
                                </thead>
                                <tbody>
                                    {control.controlTasks?.map((t: ControlTaskDTO) => (
                                        <tr key={t.id}>
                                            <td className="text-sm text-content-emphasis">{t.title}</td>
                                            <td><span className={`badge ${TASK_STATUS_BADGE[t.status] || 'badge-neutral'}`}>{t.status}</span></td>
                                            <td className="text-xs text-content-muted">{t.assignee?.name || '—'}</td>
                                            <td className="text-xs text-content-muted">{t.dueAt ? formatDate(t.dueAt) : '—'}</td>
                                            {permissions.canWrite && (
                                                <td>
                                                    {t.status !== 'DONE' && (
                                                        <button className="btn btn-sm btn-secondary" onClick={() => updateTaskStatus(t.id, 'DONE')} id={`mark-done-${t.id}`}>
                                                            Done
                                                        </button>
                                                    )}
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                    {/* Linked Work Items (via TaskLink) */}
                    <div className="glass-card p-4 mt-4" id="linked-work-items-section">
                        <h3 className="text-sm font-semibold mb-3 text-content-default">Linked Work Items (Tasks)</h3>
                        <LinkedTasksPanel
                            apiBase={apiUrl('')}
                            entityType="CONTROL"
                            entityId={controlId}
                            tenantHref={tenantHref}
                        />
                    </div>
                </div>
            )}

            {tab === 'evidence' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end gap-2">
                            <button className="btn btn-primary" onClick={() => { setShowFileUpload(!showFileUpload); setShowEvidenceForm(false); }} id="upload-evidence-btn">
                                Upload Evidence
                            </button>
                            <button className="btn btn-secondary" onClick={() => { setShowEvidenceForm(!showEvidenceForm); setShowFileUpload(false); }} id="link-evidence-btn">
                                + Link Evidence
                            </button>
                        </div>
                    )}
                    {/* File upload form for this control */}
                    {showFileUpload && permissions.canWrite && (
                        <form onSubmit={handleFileUpload} className="glass-card p-4 space-y-3" id="control-upload-form">
                            <h4 className="text-sm font-semibold text-content-emphasis">Upload Evidence for {control.name}</h4>
                            <input
                                ref={fileUploadRef}
                                type="file"
                                className="input w-full file:mr-4 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:font-medium file:bg-[var(--brand-default)] file:text-content-emphasis hover:file:bg-[var(--brand-default)]"
                                onChange={e => setFileToUpload(e.target.files?.[0] || null)}
                                required
                                id="control-file-input"
                                accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.csv,.txt,.doc,.docx,.xlsx,.xls,.json,.zip"
                            />
                            {fileToUpload && (
                                <p className="text-xs text-content-muted">{fileToUpload.name} ({fileToUpload.size < 1048576 ? `${(fileToUpload.size / 1024).toFixed(1)} KB` : `${(fileToUpload.size / 1048576).toFixed(1)} MB`})</p>
                            )}
                            <input
                                type="text"
                                className="input w-full"
                                placeholder="Title (defaults to filename)"
                                value={fileUploadTitle}
                                onChange={e => setFileUploadTitle(e.target.value)}
                                id="control-upload-title"
                            />
                            {fileUploadError && (
                                <div className="text-red-400 text-sm bg-red-900/20 rounded px-3 py-2">{fileUploadError}</div>
                            )}
                            {fileUploading && (
                                // Epic 59 — ProgressBar primitive. The actual
                                // upload is XHR-bounded so we show a stable
                                // 60% "working" signal; the ARIA value stays
                                // correct for AT consumers.
                                <ProgressBar
                                    value={60}
                                    size="md"
                                    variant="brand"
                                    aria-label="Uploading evidence file"
                                />
                            )}
                            <button type="submit" disabled={fileUploading || !fileToUpload} className="btn btn-primary" id="submit-control-upload">
                                {fileUploading ? 'Uploading...' : 'Upload'}
                            </button>
                        </form>
                    )}
                    {showEvidenceForm && permissions.canWrite && (
                        <form onSubmit={linkEvidence} className="glass-card p-4 space-y-3">
                            <input type="url" className="input w-full" placeholder="Evidence URL *" value={evidenceUrl} onChange={e => setEvidenceUrl(e.target.value)} required id="evidence-url-input" />
                            <textarea className="input w-full" rows={2} placeholder="Note (optional)" value={evidenceNote} onChange={e => setEvidenceNote(e.target.value)} id="evidence-note-input" />
                            <button type="submit" disabled={savingEvidence} className="btn btn-primary" id="submit-evidence-btn">
                                {savingEvidence ? 'Linking...' : 'Link Evidence'}
                            </button>
                        </form>
                    )}
                    <div className="glass-card overflow-hidden">
                        {(() => {
                            const linkedFileIds = new Set(control.evidenceLinks?.map((l: EvidenceLinkDTO) => l.fileId).filter(Boolean) ?? []);
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const directEvidence = (control.evidence ?? []).filter((e: any) => !e.fileRecordId || !linkedFileIds.has(e.fileRecordId));
                            const hasLinks = (control.evidenceLinks?.length ?? 0) > 0;
                            const hasEvidence = directEvidence.length > 0;
                            if (!hasLinks && !hasEvidence) {
                                return <div className="p-8 text-center text-content-subtle text-sm" id="no-evidence">No evidence linked</div>;
                            }
                            return (
                                <table className="data-table" id="evidence-table">
                                    <thead>
                                        <tr><th>Type</th><th>Title / URL</th><th>Status</th><th>Date</th>{permissions.canWrite && <th>Actions</th>}</tr>
                                    </thead>
                                    <tbody>
                                        {control.evidenceLinks?.map((el: EvidenceLinkDTO) => (
                                            <tr key={`link-${el.id}`}>
                                                <td><span className={`badge ${el.kind === 'FILE' ? 'badge-success' : 'badge-info'} text-xs`}>{el.kind}</span></td>
                                                <td className="text-sm">
                                                    {el.url ? <a href={el.url} target="_blank" rel="noopener noreferrer" className="text-[var(--brand-default)] hover:underline">{el.url}</a> : (el.note || '—')}
                                                </td>
                                                <td className="text-xs text-content-muted">{el.createdBy?.name || '—'}</td>
                                                <td className="text-xs text-content-muted">{el.createdAt ? formatDate(el.createdAt) : '—'}</td>
                                                {permissions.canWrite && (
                                                    <td>
                                                        <button className="text-red-400 text-xs hover:text-red-300" onClick={() => unlinkEvidence(el.id)} id={`unlink-${el.id}`}>
                                                            × Remove
                                                        </button>
                                                    </td>
                                                )}
                                            </tr>
                                        ))}
                                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                                        {directEvidence.map((ev: any) => (
                                            <tr key={`ev-${ev.id}`}>
                                                <td><span className={`badge ${ev.type === 'FILE' ? 'badge-success' : ev.type === 'TEXT' ? 'badge-neutral' : 'badge-info'} text-xs`}>{ev.type}</span></td>
                                                <td className="text-sm">
                                                    <Link href={tenantHref(`/evidence`)} className="text-[var(--brand-default)] hover:underline">{ev.title}</Link>
                                                </td>
                                                <td>
                                                    <span className={`badge text-xs ${ev.status === 'APPROVED' ? 'badge-success' : ev.status === 'REJECTED' ? 'badge-danger' : ev.status === 'SUBMITTED' ? 'badge-info' : 'badge-neutral'}`}>
                                                        {ev.status}
                                                    </span>
                                                </td>
                                                <td className="text-xs text-content-muted">{ev.createdAt ? formatDate(ev.createdAt) : '—'}</td>
                                                {permissions.canWrite && <td />}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            );
                        })()}
                    </div>
                </div>
            )}

            {tab === 'mappings' && (
                <div className="space-y-4">
                    {permissions.canWrite && (
                        <div className="flex justify-end">
                            <button className="btn btn-primary" onClick={() => setShowMapForm(!showMapForm)} id="map-requirement-btn">
                                + Map Requirement
                            </button>
                        </div>
                    )}
                    {showMapForm && permissions.canWrite && (
                        <div className="glass-card p-4 space-y-3">
                            <Combobox
                                id="framework-select"
                                selected={frameworks.map((f: FrameworkDTO) => ({ value: f.key ?? f.id ?? '', label: f.name })).find(o => o.value === selectedFramework) ?? null}
                                setSelected={(opt) => setSelectedFramework(opt?.value ?? '')}
                                options={frameworks.map((f: FrameworkDTO) => ({ value: f.key ?? f.id ?? '', label: f.name }))}
                                placeholder="Select Framework..."
                                matchTriggerWidth
                            />
                            {requirements.length > 0 && (
                                <>
                                    <Combobox
                                        id="requirement-select"
                                        selected={requirements.map((r: RequirementDTO) => ({ value: r.id, label: `${r.code ? `${r.code} — ` : ''}${r.title || r.description}` })).find(o => o.value === selectedReq) ?? null}
                                        setSelected={(opt) => setSelectedReq(opt?.value ?? '')}
                                        options={requirements.map((r: RequirementDTO) => ({ value: r.id, label: `${r.code ? `${r.code} — ` : ''}${r.title || r.description}` }))}
                                        placeholder="Select Requirement..."
                                        matchTriggerWidth
                                    />
                                    <button onClick={mapRequirement} disabled={!selectedReq || savingMap} className="btn btn-primary" id="submit-mapping-btn">
                                        {savingMap ? 'Mapping...' : 'Map'}
                                    </button>
                                </>
                            )}
                        </div>
                    )}
                    <div className="glass-card overflow-hidden">
                        {(control.frameworkMappings?.length ?? 0) === 0 ? (
                            <div className="p-8 text-center text-content-subtle text-sm">No framework mappings</div>
                        ) : (
                            <table className="data-table" id="mappings-table">
                                <thead>
                                    <tr><th>Framework</th><th>Requirement</th>{permissions.canWrite && <th>Actions</th>}</tr>
                                </thead>
                                <tbody>
                                    {control.frameworkMappings?.map((m: FrameworkMappingDTO) => (
                                        <tr key={m.id}>
                                            <td className="text-sm text-content-emphasis">{m.fromRequirement?.framework?.name || '—'}</td>
                                            <td className="text-sm text-content-default">
                                                {m.fromRequirement?.code && (
                                                    <CopyText
                                                        value={m.fromRequirement.code}
                                                        label={`Copy requirement code ${m.fromRequirement.code}`}
                                                        successMessage="Requirement code copied"
                                                        className="mr-2 text-content-subtle"
                                                    >
                                                        {m.fromRequirement.code}
                                                    </CopyText>
                                                )}
                                                {m.fromRequirement?.title || m.fromRequirement?.description || '—'}
                                            </td>
                                            {permissions.canWrite && (
                                                <td>
                                                    <button className="text-red-400 text-xs hover:text-red-300" onClick={() => unmapRequirement(m.fromRequirement?.id || m.fromRequirementId || '')} id={`unmap-${m.id}`}>
                                                        × Remove
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>
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
                <div className="glass-card overflow-hidden">
                    {activityLoading ? (
                        <div className="p-8 text-center text-content-subtle animate-pulse">Loading activity...</div>
                    ) : activity.length === 0 ? (
                        <div className="p-8 text-center text-content-subtle text-sm">No activity recorded</div>
                    ) : (
                        <div className="divide-y divide-border-default/50" id="activity-feed">
                            {activity.map((ev: AuditLogEntry) => (
                                <div key={ev.id} className="px-5 py-3 flex items-start gap-3">
                                    <div className="mt-0.5">
                                        <span className="badge badge-info text-xs">{EVENT_LABELS[ev.action] || ev.action}</span>
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
                <div className="glass-card p-4">
                    <TestPlansPanel controlId={controlId} />
                </div>
            )}
        </EntityDetailLayout>
    );
}
