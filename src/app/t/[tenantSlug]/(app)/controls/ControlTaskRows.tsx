"use client";

/**
 * Controls PR-1 — inline task rows rendered under an expanded control row
 * (Tidal-style nesting). Mounts only when the control row is expanded, so the
 * fetch is lazy (one request per control, on first expand). Read-only here;
 * PR-2 wires a task click → task quick-view in the side panel.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { useTenantHref } from "@/lib/tenant-context-provider";

export interface ControlTask {
    id: string;
    key?: string;
    title: string;
    status: string;
    severity?: string | null;
    assignee?: { name?: string | null } | null;
    /** Linked-evidence count (from the task list `_count.evidence`). */
    _count?: { evidence?: number } | null;
}

const TASK_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    OPEN: "warning",
    TRIAGED: "warning",
    IN_PROGRESS: "info",
    BLOCKED: "error",
    DONE: "success",
    RESOLVED: "success",
    CLOSED: "neutral",
    CANCELLED: "neutral",
};

export function ControlTaskRows({
    tenantSlug,
    controlId,
    controlCategory,
    onTaskClick,
}: {
    tenantSlug: string;
    controlId: string;
    /**
     * The parent control's category — tasks have no category of their own, so
     * the inline row INHERITS and displays the control's. Display-only: it is
     * NOT a filter dimension (the list filter targets controls, not the nested
     * task sub-rows).
     */
    controlCategory?: string | null;
    /**
     * When provided, the whole task row is a button that opens the task
     * quick-view (PR-2). Without it, the row is a plain link to the task page
     * (the PR-1 default).
     */
    onTaskClick?: (task: ControlTask) => void;
}) {
    const tenantHref = useTenantHref();
    const [tasks, setTasks] = useState<ControlTask[] | null>(null);
    const [error, setError] = useState(false);

    useEffect(() => {
        let active = true;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setTasks(null);
        setError(false);
        fetch(
            `/api/t/${tenantSlug}/tasks?linkedEntityType=CONTROL&linkedEntityId=${encodeURIComponent(controlId)}`,
        )
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
            .then((data) => {
                if (!active) return;
                const rows: ControlTask[] = Array.isArray(data) ? data : (data?.rows ?? []);
                setTasks(rows);
            })
            .catch(() => active && setError(true));
        return () => {
            active = false;
        };
    }, [tenantSlug, controlId]);

    return (
        <div
            className="border-l-2 border-border-emphasis/40 bg-bg-subtle/30 py-1 pl-12 pr-4"
            data-control-task-rows={controlId}
        >
            {error ? (
                <p className="py-2 text-xs text-content-error">Couldn&apos;t load tasks.</p>
            ) : tasks === null ? (
                <p className="py-2 text-xs text-content-subtle animate-pulse">Loading tasks…</p>
            ) : tasks.length === 0 ? (
                <p className="py-2 text-xs text-content-subtle">No tasks for this control.</p>
            ) : (
                <ul className="divide-y divide-border-subtle">
                    {tasks.map((t) => {
                        // Inline metadata shown on every task row: category
                        // (inherited from the control), owner, evidence count,
                        // and the task's own status. Display-only — not filterable.
                        const evidenceCount = t._count?.evidence ?? 0;
                        const meta = (
                            <>
                                <span className="min-w-0 flex-1 truncate text-sm text-content-default transition-colors group-hover:text-[var(--brand-default)]">
                                    {t.title}
                                </span>
                                {controlCategory && (
                                    <span className="shrink-0 truncate text-xs text-content-subtle">
                                        {controlCategory}
                                    </span>
                                )}
                                {t.assignee?.name && (
                                    <span className="shrink-0 truncate text-xs text-content-subtle">
                                        {t.assignee.name}
                                    </span>
                                )}
                                <span className="shrink-0 text-xs text-content-subtle">
                                    {evidenceCount} evidence
                                </span>
                                <StatusBadge
                                    variant={TASK_STATUS_BADGE[t.status] ?? "neutral"}
                                    size="sm"
                                >
                                    {t.status}
                                </StatusBadge>
                            </>
                        );
                        return (
                            <li key={t.id} data-control-task={t.id}>
                                {onTaskClick ? (
                                    <button
                                        type="button"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onTaskClick(t);
                                        }}
                                        className="group flex w-full cursor-pointer items-center gap-default rounded px-2 py-1.5 text-left transition-colors hover:bg-bg-muted/50"
                                        data-task-quickview={t.id}
                                    >
                                        {meta}
                                    </button>
                                ) : (
                                    <Link
                                        href={tenantHref(`/tasks/${t.id}`)}
                                        className="group flex w-full cursor-pointer items-center gap-default rounded px-2 py-1.5 transition-colors hover:bg-bg-muted/50"
                                    >
                                        {meta}
                                    </Link>
                                )}
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
}
