'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

import { formatDate } from '@/lib/format-date';
import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
// The canonical task-create modal (the SAME one the Tasks page "+ Task"
// button opens). Reused here so a task created from a control / asset /
// risk detail page is identical to a standalone task — full fields, and
// it lands in the global Tasks table (visible in the Tasks list) linked
// back to this entity via TaskLink.
import { NewTaskModal } from '@/app/t/[tenantSlug]/(app)/tasks/NewTaskModal';

/* eslint-disable @typescript-eslint/no-explicit-any */
const TASK_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    OPEN: 'neutral', TRIAGED: 'info', IN_PROGRESS: 'info',
    BLOCKED: 'error', RESOLVED: 'success', CLOSED: 'neutral', CANCELED: 'neutral',
};
const SEVERITY_BADGE: Record<string, StatusBadgeVariant> = {
    CRITICAL: 'error', HIGH: 'error', MEDIUM: 'warning', LOW: 'info', INFO: 'neutral',
};

interface LinkedTasksPanelProps {
    apiBase: string;
    /**
     * Domain entity the listed tasks are linked to. Drives the
     * filter query AND (when `canWrite`) the entityType passed
     * into the create modal so newly-created tasks are linked back
     * to the same entity.
     *
     * Accepts a string for backward compatibility with the
     * read-only call sites that pre-date the create flow, but the
     * canonical values are `'ASSET' | 'RISK'` — the create modal
     * only fires for those.
     */
    entityType: string;
    entityId: string;
    tenantHref: (path: string) => string;
    /**
     * When true, surface a "+ Task" affordance that opens
     * `<LinkedTaskCreateModal>`. The Asset + Risk detail pages
     * pass through their existing `permissions.canWrite` so
     * READER roles see only the read-only list.
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
    const [tasks, setTasks] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [creating, setCreating] = useState(false);

    const loadTasks = useCallback(async () => {
        setLoading(true);
        try {
            // `apiBase` is `apiUrl('')`, which carries a trailing slash
            // (`/api/t/<slug>/`). Appending `/tasks` would yield a double
            // slash (`//tasks`) — Next.js 308-redirects that to a
            // normalised ABSOLUTE url, which breaks under plain HTTP
            // (ERR_SSL_PROTOCOL_ERROR) and silently empties the panel.
            // Strip the trailing slash so the request stays same-origin.
            const base = apiBase.replace(/\/+$/, '');
            // PR #158 changed `/tasks` to return `{ rows, truncated }` from
            // the prior raw-array shape. Accept both — older deploys still
            // emit arrays, and this is the only LinkedTasksPanel touch
            // point so a defensive read is cheaper than a coordinated
            // schema flip.
            const res = await fetch(
                `${base}/tasks?linkedEntityType=${encodeURIComponent(entityType)}&linkedEntityId=${encodeURIComponent(entityId)}`,
            );
            const data: unknown = res.ok ? await res.json() : { rows: [] };
            if (Array.isArray(data)) setTasks(data);
            else if (
                data &&
                typeof data === 'object' &&
                Array.isArray((data as { rows?: unknown }).rows)
            ) {
                setTasks((data as { rows: unknown[] }).rows);
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

    // The unified create modal links back to the canonical entity
    // types (ASSET / RISK / CONTROL). Other callers (legacy) pass
    // strings that don't fit; gate the affordance so a stray entity
    // type can't render an unmoored create dialog.
    const canonicalEntityType: 'ASSET' | 'RISK' | 'CONTROL' | null =
        entityType === 'ASSET' ||
        entityType === 'RISK' ||
        entityType === 'CONTROL'
            ? entityType
            : null;
    const showCreate = canWrite && canonicalEntityType !== null;

    return (
        <div className="space-y-default">
            {showCreate && (
                <>
                    <div className="flex justify-end">
                        <Button
                            variant="primary"
                            onClick={() => setCreating(true)}
                            id="linked-task-create-btn"
                            data-testid="linked-task-create-btn"
                        >
                            + Task
                        </Button>
                    </div>
                    {/* The canonical Tasks-page create modal. The preset
                        link wires the new task back to this entity AND the
                        create POSTs to /tasks so it shows in the global
                        Tasks list. `onCreated` keeps us on the detail page
                        and refreshes this panel. */}
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

            {loading ? (
                <div className="text-content-subtle text-sm animate-pulse py-4 text-center">
                    Loading linked tasks…
                </div>
            ) : tasks.length === 0 ? (
                <p className="text-content-subtle text-sm text-center py-4">
                    No linked tasks
                </p>
            ) : (
                <div className="space-y-1">
                    {tasks.map((task: any) => (
                        <Link
                            key={task.id}
                            href={tenantHref(`/tasks/${task.id}`)}
                            className="flex items-center gap-compact p-2 rounded-lg hover:bg-bg-muted/50 transition text-sm"
                            id={`linked-task-${task.id}`}
                        >
                            {task.key && (
                                <span className="font-mono text-xs text-content-subtle w-16 truncate">
                                    {task.key}
                                </span>
                            )}
                            <span className="flex-1 text-content-emphasis truncate">
                                {task.title}
                            </span>
                            <StatusBadge
                                variant={
                                    TASK_STATUS_BADGE[task.status] || 'neutral'
                                }
                            >
                                {task.status}
                            </StatusBadge>
                            {task.severity && (
                                <StatusBadge
                                    variant={
                                        SEVERITY_BADGE[task.severity] ||
                                        'neutral'
                                    }
                                >
                                    {task.severity}
                                </StatusBadge>
                            )}
                            {task.dueAt && (
                                <span
                                    className={`text-xs ${
                                        new Date(task.dueAt) < new Date()
                                            ? 'text-content-error'
                                            : 'text-content-muted'
                                    }`}
                                >
                                    {formatDate(task.dueAt)}
                                </span>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}
