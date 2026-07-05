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
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Heading } from "@/components/ui/typography";
import { StatusBadge, type StatusBadgeVariant } from "@/components/ui/status-badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { UserCombobox } from "@/components/ui/user-combobox";
import { FormField } from "@/components/ui/form-field";
import { RequiredMarker } from "@/components/ui/required-marker";
import { PanelTabs } from "./PanelTabs";
import { DatePicker } from "@/components/ui/date-picker/date-picker";
import { parseYMD, startOfUtcDay, toYMD } from "@/components/ui/date-picker/date-utils";
import { PanelActivityFeed } from "./PanelActivityFeed";
import { EvidenceUploadSection } from "@/components/evidence/EvidenceUploadSection";
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
    onSaved,
}: {
    tenantSlug: string;
    task: ControlTask;
    canWrite: boolean;
    /** Retained for API compatibility (AsidePanel owns the close affordance). */
    onClose?: () => void;
    onSaved: () => void;
}) {
    const tx = useTranslations("controls");
    const [tab, setTab] = useState<Tab>("details");
    const base = `/api/t/${tenantSlug}/tasks/${task.id}`;

    // ── Edit form (seeded async from GET /tasks/{id}) — AUTO-SAVED ──
    // Text fields debounce (~800ms) + flush on blur; the type/severity/
    // priority dropdowns, the due-date picker, and the assignee picker commit
    // on change. A live status line replaces the old Cancel/Save buttons.
    const [title, setTitle] = useState(task.title ?? "");
    const [description, setDescription] = useState("");
    const [type, setType] = useState("TASK");
    const [severity, setSeverity] = useState(task.severity ?? "MEDIUM");
    const [priority, setPriority] = useState("P2");
    const [dueAt, setDueAt] = useState("");
    const [assigneeId, setAssigneeId] = useState("");
    const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
    const [error, setError] = useState("");
    const loadedRef = useRef(false);

    // Latest field values so a debounced/blurred commit PATCHes the current
    // form, never a stale closure. `update()` is the sole writer.
    const fieldsRef = useRef({
        title: task.title ?? "",
        description: "",
        type: "TASK",
        severity: task.severity ?? "MEDIUM",
        priority: "P2",
        dueAt: "",
    });
    const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const titleInvalid = title.trim().length < 1;

    useEffect(() => {
        let active = true;
        loadedRef.current = false;
        fetch(base)
            .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load failed"))))
            .then((t: TaskDetail) => {
                if (!active) return;
                setTitle(t.title ?? "");
                setDescription(t.description ?? "");
                setType(t.type ?? "TASK");
                setSeverity(t.severity ?? "MEDIUM");
                setPriority(t.priority ?? "P2");
                setDueAt(t.dueAt ? String(t.dueAt).slice(0, 10) : "");
                setAssigneeId(t.assigneeUserId ?? "");
                fieldsRef.current = {
                    title: t.title ?? "",
                    description: t.description ?? "",
                    type: t.type ?? "TASK",
                    severity: t.severity ?? "MEDIUM",
                    priority: t.priority ?? "P2",
                    dueAt: t.dueAt ? String(t.dueAt).slice(0, 10) : "",
                };
                loadedRef.current = true;
            })
            .catch(() => undefined);
        return () => {
            active = false;
        };
    }, [base]);

    const commitFields = useCallback(async () => {
        if (!canWrite || !loadedRef.current) return;
        const f = fieldsRef.current;
        if (f.title.trim().length < 1) {
            setError(tx("detail.errors.titleRequired"));
            setSaveState("error");
            return;
        }
        setSaveState("saving");
        setError("");
        try {
            const res = await fetch(base, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    title: f.title.trim(),
                    description: f.description.trim() || null,
                    type: f.type,
                    severity: f.severity,
                    priority: f.priority,
                    dueAt: f.dueAt || null,
                }),
            });
            if (!res.ok) throw new Error(tx("detail.errors.saveFailed"));
            setSaveState("saved");
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : tx("detail.errors.saveFailed"));
            setSaveState("error");
        }
    }, [canWrite, base, onSaved, tx]);

    const scheduleCommit = useCallback(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => void commitFields(), 800);
    }, [commitFields]);

    const commitNow = useCallback(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        void commitFields();
    }, [commitFields]);

    /** Update a field's ref + state in lockstep, then save (debounced or now). */
    const update = useCallback(
        (partial: Partial<typeof fieldsRef.current>, immediate: boolean) => {
            fieldsRef.current = { ...fieldsRef.current, ...partial };
            if (partial.title !== undefined) setTitle(partial.title);
            if (partial.description !== undefined) setDescription(partial.description);
            if (partial.type !== undefined) setType(partial.type);
            if (partial.severity !== undefined) setSeverity(partial.severity);
            if (partial.priority !== undefined) setPriority(partial.priority);
            if (partial.dueAt !== undefined) setDueAt(partial.dueAt);
            if (immediate) commitNow();
            else scheduleCommit();
        },
        [commitNow, scheduleCommit],
    );

    /** Assignee persists via its own POST endpoint, on change. */
    const commitAssignee = useCallback(
        async (userId: string) => {
            if (!canWrite) return;
            setSaveState("saving");
            setError("");
            try {
                const res = await fetch(`${base}/assign`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ assigneeUserId: userId || null }),
                });
                if (!res.ok) throw new Error(tx("detail.errors.assigneeUpdateFailed"));
                setSaveState("saved");
                onSaved();
            } catch (err) {
                setError(err instanceof Error ? err.message : tx("detail.errors.assigneeUpdateFailed"));
                setSaveState("error");
            }
        },
        [canWrite, base, onSaved, tx],
    );

    return (
        <div className="space-y-default" role="region" aria-label={tx("detail.editorAria.task")} data-testid="task-edit-panel">
            <div className="flex items-center gap-tight">
                {task.key && <span className="font-mono text-xs text-content-muted">{task.key}</span>}
                <StatusBadge variant={TASK_STATUS_BADGE[task.status] ?? "neutral"} size="sm">
                    {task.status}
                </StatusBadge>
            </div>
            <Heading level={3} className="break-words">{task.title}</Heading>

            <PanelTabs<Tab>
                tabs={[{ id: "details", label: tx("detail.tabs.details") }, { id: "activity", label: tx("detail.tabs.activity") }]}
                active={tab}
                onSelect={setTab}
            />

            {tab === "details" ? (
                <div className="space-y-default">
                    {error && (
                        <div className="rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error" role="alert">
                            {error}
                        </div>
                    )}
                    {/* Auto-saved edit form (PATCH on change/blur) — no Save button. */}
                    <div className="space-y-default" data-testid="task-edit-form">
                        <fieldset className="space-y-default" disabled={!canWrite}>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-title">
                                    {tx("detail.fields.title")} <RequiredMarker />
                                </label>
                                <input
                                    id="task-panel-title"
                                    type="text"
                                    className="input w-full"
                                    value={title}
                                    onChange={(e) => update({ title: e.target.value }, false)}
                                    onBlur={commitNow}
                                    required
                                    aria-invalid={titleInvalid || undefined}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-description">
                                    {tx("detail.fields.description")}
                                </label>
                                <textarea
                                    id="task-panel-description"
                                    className="input w-full"
                                    rows={3}
                                    value={description}
                                    onChange={(e) => update({ description: e.target.value }, false)}
                                    onBlur={commitNow}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-type">{tx("detail.fields.type")}</label>
                                <Combobox
                                    id="task-panel-type"
                                    name="type"
                                    options={TYPE_OPTIONS}
                                    selected={TYPE_OPTIONS.find((o) => o.value === type) ?? null}
                                    setSelected={(o) => update({ type: o?.value ?? "TASK" }, true)}
                                    disabled={!canWrite}
                                    hideSearch
                                    matchTriggerWidth
                                    forceDropdown
                                    buttonProps={{ className: "w-full", size: "sm" }}
                                    caret
                                />
                            </div>
                            <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                                <div>
                                    <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-severity">{tx("detail.fields.severity")}</label>
                                    <Combobox
                                        id="task-panel-severity"
                                        name="severity"
                                        options={SEVERITY_OPTIONS}
                                        selected={SEVERITY_OPTIONS.find((o) => o.value === severity) ?? null}
                                        setSelected={(o) => update({ severity: o?.value ?? "MEDIUM" }, true)}
                                        disabled={!canWrite}
                                        hideSearch
                                        matchTriggerWidth
                                        forceDropdown
                                        buttonProps={{ className: "w-full", size: "sm" }}
                                        caret
                                    />
                                </div>
                                <div>
                                    <label className="mb-1 block text-sm text-content-default" htmlFor="task-panel-priority">{tx("detail.fields.priority")}</label>
                                    <Combobox
                                        id="task-panel-priority"
                                        name="priority"
                                        options={PRIORITY_OPTIONS}
                                        selected={PRIORITY_OPTIONS.find((o) => o.value === priority) ?? null}
                                        setSelected={(o) => update({ priority: o?.value ?? "P2" }, true)}
                                        disabled={!canWrite}
                                        hideSearch
                                        matchTriggerWidth
                                        forceDropdown
                                        buttonProps={{ className: "w-full", size: "sm" }}
                                        caret
                                    />
                                </div>
                            </div>
                            <FormField label={tx("detail.fields.dueDate")}>
                                <DatePicker
                                    id="task-panel-due"
                                    className="w-full"
                                    placeholder={tx("detail.fields.selectDate")}
                                    clearable
                                    align="start"
                                    value={parseYMD(dueAt)}
                                    onChange={(next) => update({ dueAt: toYMD(next) ?? "" }, true)}
                                    disabledDays={{ before: startOfUtcDay(new Date()) }}
                                    aria-label={tx("detail.fields.dueDateAria")}
                                />
                            </FormField>
                            <FormField label={tx("detail.fields.assignee")} description={tx("detail.fields.ownerHint")}>
                                <UserCombobox
                                    id="task-panel-assignee"
                                    name="assigneeUserId"
                                    tenantSlug={tenantSlug}
                                    disabled={!canWrite}
                                    size="sm"
                                    selectedId={assigneeId || null}
                                    onChange={(userId) => {
                                        setAssigneeId(userId ?? "");
                                        void commitAssignee(userId ?? "");
                                    }}
                                    placeholder={task.assignee?.name || tx("detail.fields.unassigned")}
                                />
                            </FormField>
                        </fieldset>
                        {canWrite && (
                            <p
                                className="text-xs text-content-muted"
                                data-testid="task-edit-autosave-status"
                                aria-live="polite"
                            >
                                {saveState === "saving"
                                    ? tx("detail.autosave.saving")
                                    : saveState === "saved"
                                      ? tx("detail.autosave.saved")
                                      : saveState === "error"
                                        ? tx("detail.autosave.notSaved")
                                        : tx("detail.autosave.auto")}
                            </p>
                        )}
                    </div>
                    {/* Drag-and-drop evidence upload (canonical FileDropzone, compact in the rail). */}
                    <EvidenceUploadSection
                        tenantSlug={tenantSlug}
                        linkField="taskId"
                        linkId={task.id}
                        canWrite={canWrite}
                        compactDropzone
                        listEndpoint={`/tasks/${task.id}/evidence`}
                        urlLinkEndpoint={`/tasks/${task.id}/evidence`}
                    />
                </div>
            ) : (
                <PanelActivityFeed tenantSlug={tenantSlug} endpoint={`/tasks/${task.id}/activity`} />
            )}
        </div>
    );
}
