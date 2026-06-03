'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus } from '@/components/ui/icons/nucleo';
import { Button } from '@/components/ui/button';
import {
    StatusBadge,
    type StatusBadgeVariant,
} from '@/components/ui/status-badge';
import { DataTable, createColumns } from '@/components/ui/table';
import { TableTitleCell } from '@/components/ui/table-title-cell';
import { TimestampTooltip } from '@/components/ui/timestamp-tooltip';
// Clicking a task row opens the SAME right-side edit Sheet the Tasks
// page uses — inspect + edit a task without leaving the control /
// asset / risk detail page (mirrors the controls-table detail Sheet).
import { TaskDetailSheet } from '@/app/t/[tenantSlug]/(app)/tasks/TaskDetailSheet';
// The canonical task-create modal (the SAME one the Tasks page "+ Task"
// button opens). Reused here so a task created from a control / asset /
// risk detail page is identical to a standalone task — full fields, and
// it lands in the global Tasks table (visible in the Tasks list) linked
// back to this entity via TaskLink.
import { NewTaskModal } from '@/app/t/[tenantSlug]/(app)/tasks/NewTaskModal';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mirrors the Tasks page (TasksClient) maps so the control / asset /
// risk Tasks tab renders the SAME columns + tones as the global table.
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

interface LinkedTask {
    id: string;
    key?: string | null;
    title: string;
    type?: string | null;
    status: string;
    severity?: string | null;
    dueAt?: string | null;
    updatedAt?: string | null;
    assignee?: { name?: string | null } | null;
}

interface LinkedTasksPanelProps {
    apiBase: string;
    /**
     * Domain entity the listed tasks are linked to. Drives the filter
     * query AND (when `canWrite`) the entityType passed into the create
     * modal. Canonical values: `'ASSET' | 'RISK' | 'CONTROL'`.
     */
    entityType: string;
    entityId: string;
    tenantHref: (path: string) => string;
    /**
     * When true, surface the create affordance + row multi-select.
     * READER roles see only the read-only table.
     */
    canWrite?: boolean;
}

export default function LinkedTasksPanel({
    apiBase,
    entityType,
    entityId,
    tenantHref,
    canWrite = false,
}: LinkedTasksPanelProps) {
    const [tasks, setTasks] = useState<LinkedTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);
    // Clicking a row opens the task in the right-side edit Sheet.
    const [sheetTaskId, setSheetTaskId] = useState<string | null>(null);

    // `apiBase` is `apiUrl('')` → `/api/t/<slug>/`. Derive the bits the
    // TaskDetailSheet needs from it (no extra props at the call sites).
    const apiBaseTrimmed = apiBase.replace(/\/+$/, '');
    const apiUrl = useCallback(
        (path: string) =>
            `${apiBaseTrimmed}${path.startsWith('/') ? path : `/${path}`}`,
        [apiBaseTrimmed],
    );
    const tenantSlug = apiBase.match(/\/t\/([^/]+)/)?.[1] ?? '';

    const loadTasks = useCallback(async () => {
        setLoading(true);
        try {
            // `apiBase` is `apiUrl('')` (trailing slash). Strip it so the
            // request stays same-origin (see prior //tasks 308 bug).
            const base = apiBase.replace(/\/+$/, '');
            const res = await fetch(
                `${base}/tasks?linkedEntityType=${encodeURIComponent(entityType)}&linkedEntityId=${encodeURIComponent(entityId)}`,
            );
            const data: unknown = res.ok ? await res.json() : { rows: [] };
            if (Array.isArray(data)) setTasks(data as LinkedTask[]);
            else if (
                data &&
                typeof data === 'object' &&
                Array.isArray((data as { rows?: unknown }).rows)
            ) {
                setTasks((data as { rows: LinkedTask[] }).rows);
            } else setTasks([]);
        } catch {
            setTasks([]);
        } finally {
            setLoading(false);
        }
    }, [apiBase, entityType, entityId]);

    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        void loadTasks();
    }, [loadTasks]);

    const canonicalEntityType: 'ASSET' | 'RISK' | 'CONTROL' | null =
        entityType === 'ASSET' ||
        entityType === 'RISK' ||
        entityType === 'CONTROL'
            ? entityType
            : null;
    const showCreate = canWrite && canonicalEntityType !== null;

    // Columns mirror the Tasks page table so this tab reads identically.
    const columns = useMemo(
        () =>
            createColumns<LinkedTask>([
                {
                    id: 'title',
                    header: 'Title',
                    accessorFn: (t) => t.title,
                    // disableTruncate → the title column sizes to its
                    // content (fits the longest task name) instead of
                    // ellipsis-truncating. No `href`: the title renders
                    // as a span so a click anywhere on the row opens the
                    // edit Sheet (the row's onRowClick), uniformly.
                    meta: { disableTruncate: true },
                    cell: ({ row }) => (
                        <TableTitleCell>{row.original.title}</TableTitleCell>
                    ),
                },
                {
                    id: 'type',
                    header: 'Type',
                    accessorFn: (t) => t.type ?? '',
                    cell: ({ getValue }) => (
                        <span className="text-xs text-content-muted">
                            {TYPE_LABELS[getValue<string>()] || getValue<string>() || '—'}
                        </span>
                    ),
                },
                {
                    id: 'severity',
                    header: 'Severity',
                    accessorFn: (t) => t.severity ?? '',
                    cell: ({ row }) =>
                        row.original.severity ? (
                            <StatusBadge
                                variant={SEVERITY_BADGE[row.original.severity] || 'neutral'}
                            >
                                {row.original.severity}
                            </StatusBadge>
                        ) : (
                            <span className="text-content-subtle">—</span>
                        ),
                },
                {
                    id: 'status',
                    header: 'Status',
                    accessorFn: (t) => t.status,
                    cell: ({ row }) => (
                        <StatusBadge
                            variant={STATUS_BADGE[row.original.status] || 'neutral'}
                        >
                            {STATUS_LABELS[row.original.status] || row.original.status}
                        </StatusBadge>
                    ),
                },
                {
                    id: 'assignee',
                    header: 'Assignee',
                    accessorFn: (t) => t.assignee?.name || '—',
                    cell: ({ getValue }) => (
                        <span className="text-xs text-content-muted">
                            {getValue<string>()}
                        </span>
                    ),
                },
                {
                    id: 'dueAt',
                    header: 'Due Date',
                    cell: ({ row }) => (
                        <TimestampTooltip
                            date={row.original.dueAt ?? null}
                            className="text-xs text-content-muted"
                        />
                    ),
                },
            ]),
        [],
    );

    return (
        <div className="space-y-default">
            {showCreate && (
                <>
                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            size="sm"
                            onClick={() => setCreating(true)}
                            id="linked-task-create-btn"
                            data-testid="linked-task-create-btn"
                            text="Task"
                            icon={<Plus className="size-4" aria-hidden="true" />}
                        />
                    </div>
                    <NewTaskModal
                        open={creating}
                        setOpen={setCreating}
                        initialPendingLinks={[
                            {
                                entityType: canonicalEntityType,
                                entityId,
                            },
                        ]}
                        onCreated={() => void loadTasks()}
                    />
                </>
            )}

            <DataTable<LinkedTask>
                data={tasks}
                columns={columns}
                getRowId={(t) => t.id}
                loading={loading}
                // Selection is intentionally off here: a row click opens
                // the task in the right-side edit Sheet (the control-
                // table detail-Sheet pattern), so single-click is the
                // inspect/edit gesture rather than a multi-select toggle.
                selectionEnabled={false}
                onRowClick={(row) => setSheetTaskId(row.original.id)}
                resourceName={(plural) => (plural ? 'tasks' : 'task')}
                emptyState="No linked tasks"
                data-testid="linked-tasks-table"
            />

            <TaskDetailSheet
                taskId={sheetTaskId}
                setTaskId={setSheetTaskId}
                tenantSlug={tenantSlug}
                apiUrl={apiUrl}
                tenantHref={tenantHref}
                canWrite={canWrite}
                onSaved={() => void loadTasks()}
            />
        </div>
    );
}
