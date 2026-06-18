"use client";

/**
 * Controls PR-2 — task quick-view shown in the side panel when a task is
 * clicked (from a control's inline task rows or the control quick-view's Tasks
 * section). Renders from the task object already in hand (no fetch), with a
 * back-to-control affordance and a "Full view" link to the task page.
 */
import Link from "next/link";
import { useTenantHref } from "@/lib/tenant-context-provider";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { Heading } from "@/components/ui/typography";
import { ArrowLeft, Xmark } from "@/components/ui/icons/nucleo";
import type { ControlTask } from "./ControlTaskRows";

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

export function TaskQuickView({
    task,
    onBack,
    onClose,
}: {
    task: ControlTask;
    onBack: () => void;
    onClose: () => void;
}) {
    const tenantHref = useTenantHref();

    return (
        <div className="space-y-default" data-testid="task-quickview">
            <div className="flex items-center justify-between gap-tight">
                <button
                    type="button"
                    onClick={onBack}
                    className="inline-flex items-center gap-1 text-xs font-medium text-content-muted transition-colors hover:text-content-emphasis"
                    data-testid="task-quickview-back"
                >
                    <ArrowLeft width={13} height={13} /> Back to control
                </button>
                <button
                    type="button"
                    aria-label="Close quick view"
                    onClick={onClose}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded text-content-muted transition-colors hover:bg-bg-muted hover:text-content-emphasis"
                >
                    <Xmark width={14} height={14} />
                </button>
            </div>

            <div className="flex items-center gap-tight">
                {task.key && (
                    <span className="font-mono text-xs text-content-muted">{task.key}</span>
                )}
                <StatusBadge variant={TASK_STATUS_BADGE[task.status] ?? "neutral"} size="sm">
                    {task.status}
                </StatusBadge>
            </div>

            <Heading level={3} className="break-words">
                {task.title}
            </Heading>

            <Link
                href={tenantHref(`/tasks/${task.id}`)}
                className="inline-block text-xs font-medium text-[var(--brand-default)] hover:opacity-80"
                data-testid="task-quickview-fullview"
            >
                Full view →
            </Link>

            <dl className="space-y-tight text-sm">
                {task.assignee?.name && (
                    <div className="flex justify-between gap-default">
                        <dt className="text-content-subtle">Assignee</dt>
                        <dd className="text-right text-content-default">{task.assignee.name}</dd>
                    </div>
                )}
                {task.severity && (
                    <div className="flex justify-between gap-default">
                        <dt className="text-content-subtle">Severity</dt>
                        <dd className="text-right text-content-default">{task.severity}</dd>
                    </div>
                )}
            </dl>
        </div>
    );
}
