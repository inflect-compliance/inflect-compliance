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

interface ControlTask {
    id: string;
    key?: string;
    title: string;
    status: string;
    severity?: string | null;
    assignee?: { name?: string | null } | null;
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
}: {
    tenantSlug: string;
    controlId: string;
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
                    {tasks.map((t) => (
                        <li
                            key={t.id}
                            className="flex items-center gap-default py-1.5"
                            data-control-task={t.id}
                        >
                            <Link
                                href={tenantHref(`/tasks/${t.id}`)}
                                className="min-w-0 flex-1 truncate text-sm text-content-default hover:text-[var(--brand-default)] transition-colors"
                            >
                                {t.title}
                            </Link>
                            {t.assignee?.name && (
                                <span className="shrink-0 text-xs text-content-subtle">
                                    {t.assignee.name}
                                </span>
                            )}
                            <StatusBadge
                                variant={TASK_STATUS_BADGE[t.status] ?? "neutral"}
                                size="sm"
                            >
                                {t.status}
                            </StatusBadge>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
