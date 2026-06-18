"use client";

/**
 * Controls PR-2 — control quick-view shown in the side panel when a control
 * NAME is clicked (TidalControl pattern). Renders a condensed summary from the
 * row data already in hand (no fetch) + the control's tasks (lazy, via
 * <ControlTaskRows>); clicking a task swaps the panel to the task quick-view.
 * "Full view" links to the complete detail page.
 */
import Link from "next/link";
import { useTenantHref } from "@/lib/tenant-context-provider";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { Heading } from "@/components/ui/typography";
import { Xmark } from "@/components/ui/icons/nucleo";
import { ControlTaskRows, type ControlTask } from "./ControlTaskRows";

export interface QuickViewControl {
    id: string;
    code?: string | null;
    annexId?: string | null;
    name: string;
    description?: string | null;
    status?: string | null;
    category?: string | null;
    owner?: { name?: string | null; email?: string | null } | null;
    taskTotal?: number;
    taskDone?: number;
}

const CONTROL_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    IMPLEMENTED: "success",
    IN_PROGRESS: "info",
    NOT_STARTED: "warning",
    NOT_APPLICABLE: "neutral",
};

export function ControlQuickView({
    tenantSlug,
    control,
    onClose,
    onTaskClick,
}: {
    tenantSlug: string;
    control: QuickViewControl;
    onClose: () => void;
    onTaskClick: (task: ControlTask) => void;
}) {
    const tenantHref = useTenantHref();
    const code = control.code || control.annexId;

    return (
        <div className="space-y-default" data-testid="control-quickview">
            <div className="flex items-start justify-between gap-tight">
                <div className="flex items-center gap-tight">
                    {code && (
                        <span className="font-mono text-xs text-content-muted">{code}</span>
                    )}
                    {control.status && (
                        <StatusBadge
                            variant={CONTROL_STATUS_BADGE[control.status] ?? "neutral"}
                            size="sm"
                        >
                            {control.status.replace(/_/g, " ")}
                        </StatusBadge>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Close quick view"
                    onClick={onClose}
                    className="inline-flex size-6 shrink-0 items-center justify-center rounded text-content-muted transition-colors hover:bg-bg-muted hover:text-content-emphasis"
                >
                    <Xmark width={14} height={14} />
                </button>
            </div>

            <Heading level={3} className="break-words">
                {control.name}
            </Heading>

            <Link
                href={tenantHref(`/controls/${control.id}`)}
                className="inline-block text-xs font-medium text-[var(--brand-default)] hover:opacity-80"
                data-testid="control-quickview-fullview"
            >
                Full view →
            </Link>

            {control.description && (
                <div className="space-y-1">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-content-subtle">
                        Description
                    </p>
                    <p className="break-words text-sm text-content-default">
                        {control.description}
                    </p>
                </div>
            )}

            <dl className="space-y-tight text-sm">
                {control.category && (
                    <div className="flex justify-between gap-default">
                        <dt className="text-content-subtle">Category</dt>
                        <dd className="text-right text-content-default">{control.category}</dd>
                    </div>
                )}
                {control.owner?.name && (
                    <div className="flex justify-between gap-default">
                        <dt className="text-content-subtle">Owner</dt>
                        <dd className="text-right text-content-default">{control.owner.name}</dd>
                    </div>
                )}
                {(control.taskTotal ?? 0) > 0 && (
                    <div className="flex justify-between gap-default">
                        <dt className="text-content-subtle">Tasks</dt>
                        <dd className="text-right text-content-default">
                            {control.taskDone ?? 0}/{control.taskTotal} done
                        </dd>
                    </div>
                )}
            </dl>

            <div className="space-y-1">
                <p className="text-[11px] font-medium uppercase tracking-wide text-content-subtle">
                    Tasks
                </p>
                <ControlTaskRows
                    tenantSlug={tenantSlug}
                    controlId={control.id}
                    onTaskClick={onTaskClick}
                />
            </div>
        </div>
    );
}
