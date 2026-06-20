"use client";

/**
 * Task side-panel — EDITABLE (replaces the old read-only TaskQuickView).
 *
 * Opened by a single click on a task row beneath a control. Two tabs:
 *   - Details: edit the task (title / description / type / severity / priority
 *     / due date / assignee) inline.
 *   - Activity: the task's audit feed.
 *
 * Renders inside the docked <AsidePanel> (no overlay → the table stays
 * visible). Seeds the form from a fresh GET /tasks/{id} on mount.
 */
import { useEffect, useRef, useState } from "react";
import { Heading } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { UserCombobox } from "@/components/ui/user-combobox";
import { FormField } from "@/components/ui/form-field";
import { RequiredMarker } from "@/components/ui/required-marker";
import { ArrowLeft, Xmark } from "@/components/ui/icons/nucleo";
import { PanelTabs } from "./PanelTabs";
import { DatePicker } from "@/components/ui/date-picker/date-picker";
import { parseYMD, startOfUtcDay, toYMD } from "@/components/ui/date-picker/date-utils";
import { PanelActivityFeed } from "./PanelActivityFeed";
import type { ControlTask } from "./ControlTaskRows";

const SEVERITY_OPTIONS: ComboboxOption[] = [
    { value: "INFO", label: "Info" },
    { value: "LOW", label: "Low" },
    { value: "MEDIUM", label: "Medium" },
    { value: "HIGH", label: "High" },
    { value: "CRITICAL", label: "Critical" },
];
const PRIORITY_OPTIONS: ComboboxOption[] = [
    { value: "P0", label: "P0 — Critical" },
    { value: "P1", label: "P1 — High" },
    { value: "P2", label: "P2 — Medium" },
    { value: "P3", label: "P3 — Low" },
];
const TYPE_OPTIONS: ComboboxOption[] = [
    { value: "TASK", label: "Task" },
    { value: "AUDIT_FINDING", label: "Audit Finding" },
    { value: "CONTROL_GAP", label: "Control Gap" },
    { value: "INCIDENT", label: "Incident" },
    { value: "IMPROVEMENT", label: "Improvement" },
];
const TASK_STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    OPEN: "warning", TRIAGED: "warning", IN_PROGRESS: "info", BLOCKED: "error",
    DONE: "success", RESOLVED: "success", CLOSED: "neutral", CANCELLED: "neutral",
};

type Tab = "details" | "activity";

interface TaskDetail {
    id: string;
    key: string | null;
    title: string;
    description: string | null;
    type: string;
    severity: string;
    priority: string;
    status: string;
    dueAt: string | null;
    assigneeUserId: string | null;
    assignee: { id: string; name: string | null; email: string | null } | null;
}

export function TaskEditPanel({
    tenantSlug,
    task,
    canWrite,
    onBack,
    onClose,
    onSaved,
}: {
    tenantSlug: string;
    task: ControlTask;
    canWrite: boolean;
    /**
     * Optional "← Back" affordance. On the Controls page the task panel is
     * reached from a parent control, so Back returns to it. On the Tasks list
     * page there's no parent — omit it and only the Close button shows.
     */
    onBack?: () => void;
    onClose: () => void;
    onSaved: () => void;
}) {
    const [tab, setTab] = useState<Tab>("details");
    const base = `/api/t/${tenantSlug}/tasks/${task.id}`;

    const [detail, setDetail] = useState<TaskDetail | null>(null);
    const [title, setTitle] = useState(task.title ?? "");
    const [description, setDescription] = useState("");
    const [type, setType] = useState("TASK");
    const [severity, setSeverity] = useState(task.severity ?? "MEDIUM");
    const [priority, setPriority] = useState("P2");
    const [dueAt, setDueAt] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const loadedRef = useRef(false);

    useEffect(() => {
        let active = true;
        loadedRef.current = false;
        fetch(base)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
            .then((t: TaskDetail) => {
                if (!active) return;
                setDetail(t);
                setTitle(t.title ?? "");
                setDescription(t.description ?? "");
                setType(t.type ?? "TASK");
                setSeverity(t.severity ?? "MEDIUM");
                setPriority(t.priority ?? "P2");
                setDueAt(t.dueAt ? String(t.dueAt).slice(0, 10) : "");
                setAssigneeId(t.assigneeUserId ?? "");
                loadedRef.current = true;
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [base]);

    const canSave = canWrite && title.trim().length >= 1 && !saving && loadedRef.current;

    const save = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setSaving(true);
        setError("");
        try {
            const res = await fetch(base, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    type,
                    severity,
                    priority,
                    dueAt: dueAt || null,
                }),
            });
            if (!res.ok) throw new Error("Failed to save task");
            if (assigneeId !== (detail?.assigneeUserId ?? "")) {
                await fetch(`${base}/assign`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assigneeUserId: assigneeId || null }),
                }).catch(() => undefined);
            }
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Failed to save task");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-default" role="region" aria-label="Task editor" data-testid="task-edit-panel">
            <div className="flex items-center justify-between gap-tight">
                {onBack ? (
                    <button
                        type="button"
                        onClick={onBack}
                        className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-content-muted transition-colors hover:text-content-emphasis"
                        data-testid="task-edit-back"
                    >
                        <ArrowLeft width={13} height={13} /> Back
                    </button>
                ) : (
                    <span />
                )}
                <button
                    type="button"
                    aria-label="Close quick view"
                    onClick={onClose}
                    className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-content-muted transition-colors hover:bg-bg-muted hover:text-content-emphasis"
                >
                    <Xmark width={14} height={14} />
                </button>
            </div>

            <div className="flex items-center gap-tight">
                {task.key && <span className="font-mono text-xs text-content-muted">{task.key}</span>}
                <StatusBadge variant={TASK_STATUS_BADGE[task.status] ?? "neutral"} size="sm">
                    {task.status}
                </StatusBadge>
            </div>
            <Heading level={3} className="break-words">{task.title}</Heading>

            <PanelTabs<Tab>
                tabs={[{ id: "details", label: "Details" }, { id: "activity", label: "Activity" }]}
                active={tab}
                onSelect={setTab}
            />

            {tab === "details" ? (
                <form onSubmit={save} className="space-y-default" data-testid="task-edit-form">
                    {error && (
                        <div className="rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert">
                            {error}
                        </div>
                    )}
                    <fieldset className="space-y-default" disabled={!canWrite || saving}>
                        <div>
                            <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-title">
                                Title <RequiredMarker />
                            </label>
                            <input
                                id="task-panel-title"
                                type="text"
                                className="input w-full"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-description">
                                Description
                            </label>
                            <textarea
                                id="task-panel-description"
                                className="input w-full"
                                rows={3}
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                            />
                        </div>
                        <div>
                            <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-type">Type</label>
                            <Combobox
                                id="task-panel-type"
                                name="type"
                                options={TYPE_OPTIONS}
                                selected={TYPE_OPTIONS.find((o) => o.value === type) ?? null}
                                setSelected={(o) => setType(o?.value ?? "TASK")}
                                disabled={!canWrite}
                                hideSearch
                                matchTriggerWidth
                                forceDropdown
                                buttonProps={{ className: "w-full" }}
                                caret
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-severity">Severity</label>
                                <Combobox
                                    id="task-panel-severity"
                                    name="severity"
                                    options={SEVERITY_OPTIONS}
                                    selected={SEVERITY_OPTIONS.find((o) => o.value === severity) ?? null}
                                    setSelected={(o) => setSeverity(o?.value ?? "MEDIUM")}
                                    disabled={!canWrite}
                                    hideSearch
                                    matchTriggerWidth
                                    forceDropdown
                                    buttonProps={{ className: "w-full" }}
                                    caret
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-priority">Priority</label>
                                <Combobox
                                    id="task-panel-priority"
                                    name="priority"
                                    options={PRIORITY_OPTIONS}
                                    selected={PRIORITY_OPTIONS.find((o) => o.value === priority) ?? null}
                                    setSelected={(o) => setPriority(o?.value ?? "P2")}
                                    disabled={!canWrite}
                                    hideSearch
                                    matchTriggerWidth
                                    forceDropdown
                                    buttonProps={{ className: "w-full" }}
                                    caret
                                />
                            </div>
                        </div>
                        <FormField label="Due Date">
                            <DatePicker
                                id="task-panel-due"
                                className="w-full"
                                placeholder="Select date"
                                clearable
                                align="start"
                                value={parseYMD(dueAt)}
                                onChange={(next) => setDueAt(toYMD(next) ?? "")}
                                disabledDays={{ before: startOfUtcDay(new Date()) }}
                                aria-label="Due date"
                            />
                        </FormField>
                        <FormField label="Assignee" description="Search members to assign, or clear to unassign.">
                            <UserCombobox
                                id="task-panel-assignee"
                                name="assigneeUserId"
                                tenantSlug={tenantSlug}
                                disabled={!canWrite}
                                selectedId={assigneeId || null}
                                onChange={(userId) => setAssigneeId(userId ?? "")}
                                placeholder={task.assignee?.name || "Unassigned"}
                            />
                        </FormField>
                    </fieldset>
                    {canWrite && (
                        <div className="flex items-center gap-tight">
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={onClose}
                                data-testid="task-edit-cancel"
                                text="Cancel"
                            />
                            <Button
                                type="submit"
                                variant="primary"
                                size="sm"
                                disabled={!canSave}
                                data-testid="task-edit-save"
                                text={saving ? "Saving…" : "Save changes"}
                            />
                        </div>
                    )}
                </form>
            ) : (
                <PanelActivityFeed tenantSlug={tenantSlug} endpoint={`/tasks/${task.id}/activity`} />
            )}
        </div>
    );
}
