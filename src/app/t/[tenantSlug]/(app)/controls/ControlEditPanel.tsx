"use client";

/**
 * Control side-panel — EDITABLE (replaces the old read-only ControlQuickView).
 *
 * Opened by a single click on a control name. Two tabs:
 *   - Details: edit the control (name / description / category / frequency /
 *     owner) inline + an EVIDENCE UPLOAD box (replaces the old "Intent" field).
 *   - Activity: the control's hash-chained audit feed.
 *
 * Renders inside the docked <AsidePanel> (no overlay → the table stays
 * visible). Replaces the separate quick-edit Sheet, so there's no more table
 * blur and no separate edit button.
 */
import { useEffect, useRef, useState } from "react";
import { Heading } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { UserCombobox } from "@/components/ui/user-combobox";
import { FormField } from "@/components/ui/form-field";
import { RequiredMarker } from "@/components/ui/required-marker";
import { Xmark } from "@/components/ui/icons/nucleo";
import { PanelTabs } from "./PanelTabs";
import { PanelActivityFeed } from "./PanelActivityFeed";

/** The subset of control row fields the panel needs to seed + display. */
export interface PanelControl {
    id: string;
    code?: string | null;
    annexId?: string | null;
    name: string;
    description?: string | null;
    status?: string | null;
    category?: string | null;
    frequency?: string | null;
    ownerUserId?: string | null;
    owner?: { id?: string; name?: string | null; email?: string | null } | null;
}

const FREQUENCY_OPTIONS: ComboboxOption[] = [
    { value: "AD_HOC", label: "Ad Hoc" },
    { value: "DAILY", label: "Daily" },
    { value: "WEEKLY", label: "Weekly" },
    { value: "MONTHLY", label: "Monthly" },
    { value: "QUARTERLY", label: "Quarterly" },
    { value: "ANNUALLY", label: "Annually" },
];

const CATEGORY_OPTIONS: ComboboxOption[] = [
    "Access Control", "Encryption", "Network Security", "Physical Security",
    "HR Security", "Operations", "Compliance", "Incident Management",
    "Business Continuity", "Other",
].map((c) => ({ value: c, label: c }));

type Tab = "details" | "activity";

interface EvidenceItem {
    id: string;
    title?: string | null;
    url?: string | null;
    note?: string | null;
    kind?: string;
}

export function ControlEditPanel({
    tenantSlug,
    control,
    canWrite,
    onClose,
    onSaved,
}: {
    tenantSlug: string;
    control: PanelControl;
    canWrite: boolean;
    onClose: () => void;
    /** Called after a successful save so the list reflects new name/owner. */
    onSaved: () => void;
}) {
    const [tab, setTab] = useState<Tab>("details");
    const base = `/api/t/${tenantSlug}/controls/${control.id}`;

    // ── Edit form (seeded from the row) ──
    const [name, setName] = useState(control.name ?? "");
    const [description, setDescription] = useState(control.description ?? "");
    const [category, setCategory] = useState(control.category ?? "");
    const [frequency, setFrequency] = useState(control.frequency ?? "");
    const [ownerId, setOwnerId] = useState(control.owner?.id ?? control.ownerUserId ?? "");
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const originalOwner = control.owner?.id ?? control.ownerUserId ?? "";
    const canSave = canWrite && name.trim().length >= 3 && !saving;

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
                    name: name.trim(),
                    description: description.trim() || null,
                    category: category.trim() || null,
                    frequency: frequency || null,
                }),
            });
            if (!res.ok) throw new Error("Update failed");
            if (ownerId.trim() !== originalOwner) {
                const ownerRes = await fetch(`${base}/owner`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ ownerUserId: ownerId.trim() || null }),
                });
                if (!ownerRes.ok) throw new Error("Owner update failed");
            }
            onSaved();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Update failed");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="space-y-default" role="region" aria-label="Control editor" data-testid="control-edit-panel">
            <div className="flex items-start justify-between gap-tight">
                <div className="flex items-center gap-tight">
                    {(control.code || control.annexId) && (
                        <span className="font-mono text-xs text-content-muted">
                            {control.code || control.annexId}
                        </span>
                    )}
                    {control.status && (
                        <StatusBadge size="sm">{control.status.replace(/_/g, " ")}</StatusBadge>
                    )}
                </div>
                <button
                    type="button"
                    aria-label="Close quick view"
                    onClick={onClose}
                    className="inline-flex size-6 shrink-0 cursor-pointer items-center justify-center rounded text-content-muted transition-colors hover:bg-bg-muted hover:text-content-emphasis"
                >
                    <Xmark width={14} height={14} />
                </button>
            </div>

            <Heading level={3} className="break-words">{control.name}</Heading>

            <PanelTabs<Tab>
                tabs={[{ id: "details", label: "Details" }, { id: "activity", label: "Activity" }]}
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
                    <form onSubmit={save} className="space-y-default" data-testid="control-edit-form">
                        <fieldset className="space-y-default" disabled={!canWrite || saving}>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="panel-name-input">
                                    Name <RequiredMarker />
                                </label>
                                <input
                                    id="panel-name-input"
                                    type="text"
                                    className="input w-full"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    required
                                    minLength={3}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="panel-description-input">
                                    Description
                                </label>
                                <textarea
                                    id="panel-description-input"
                                    className="input w-full"
                                    rows={3}
                                    value={description}
                                    onChange={(e) => setDescription(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="panel-category-input">
                                    Category
                                </label>
                                <Combobox
                                    id="panel-category-input"
                                    name="category"
                                    options={CATEGORY_OPTIONS}
                                    selected={CATEGORY_OPTIONS.find((o) => o.value === category) ?? null}
                                    setSelected={(o) => setCategory(o?.value ?? "")}
                                    placeholder="—"
                                    searchPlaceholder="Search categories…"
                                    disabled={!canWrite}
                                    matchTriggerWidth
                                    forceDropdown
                                    buttonProps={{ className: "w-full" }}
                                    caret
                                />
                            </div>
                            <div>
                                <label className="mb-1 block text-sm text-content-default" htmlFor="panel-frequency-input">
                                    Frequency
                                </label>
                                <Combobox
                                    id="panel-frequency-input"
                                    name="frequency"
                                    options={FREQUENCY_OPTIONS}
                                    selected={FREQUENCY_OPTIONS.find((o) => o.value === frequency) ?? null}
                                    setSelected={(o) => setFrequency(o?.value ?? "")}
                                    placeholder="—"
                                    disabled={!canWrite}
                                    hideSearch
                                    matchTriggerWidth
                                    forceDropdown
                                    buttonProps={{ className: "w-full" }}
                                    caret
                                />
                            </div>
                            <FormField label="Owner" description="Search members to assign, or clear to unassign.">
                                <UserCombobox
                                    id="panel-owner-input"
                                    name="ownerUserId"
                                    tenantSlug={tenantSlug}
                                    disabled={!canWrite}
                                    selectedId={ownerId || null}
                                    onChange={(userId) => setOwnerId(userId ?? "")}
                                    placeholder={control.owner?.name || control.owner?.email || "Unassigned"}
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
                                    data-testid="control-edit-cancel"
                                    text="Cancel"
                                />
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    disabled={!canSave}
                                    data-testid="control-edit-save"
                                    text={saving ? "Saving…" : "Save changes"}
                                />
                            </div>
                        )}
                    </form>

                    {/* Evidence upload box — replaces the old Intent field. */}
                    <ControlEvidenceBox tenantSlug={tenantSlug} controlId={control.id} canWrite={canWrite} />
                </div>
            ) : (
                <PanelActivityFeed tenantSlug={tenantSlug} endpoint={`/controls/${control.id}/activity`} />
            )}
        </div>
    );
}

// ─── Evidence upload + list (control-scoped) ─────────────────────────
function ControlEvidenceBox({
    tenantSlug,
    controlId,
    canWrite,
}: {
    tenantSlug: string;
    controlId: string;
    canWrite: boolean;
}) {
    const [items, setItems] = useState<EvidenceItem[] | null>(null);
    const [file, setFile] = useState<File | null>(null);
    const [title, setTitle] = useState("");
    const [url, setUrl] = useState("");
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const fileRef = useRef<HTMLInputElement>(null);

    const load = async () => {
        try {
            const res = await fetch(`/api/t/${tenantSlug}/controls/${controlId}/evidence`);
            if (!res.ok) throw new Error();
            const data = await res.json();
            const links = (data?.links ?? []).map((l: Record<string, unknown>) => ({
                id: l.id, title: l.url ?? "Link", url: l.url, note: l.note, kind: (l.kind as string) ?? "LINK",
            }));
            const ev = (data?.evidence ?? []).map((e: Record<string, unknown>) => ({
                id: e.id, title: (e.title as string) ?? "Evidence", kind: (e.type as string) ?? "FILE",
            }));
            setItems([...links, ...ev]);
        } catch {
            setItems([]);
        }
    };

    useEffect(() => {
        void load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [tenantSlug, controlId]);

    const submit = async (e: React.FormEvent) => {
        e.preventDefault();
        setErr("");
        setBusy(true);
        try {
            if (file) {
                const fd = new FormData();
                fd.append("file", file);
                if (title) fd.append("title", title);
                fd.append("controlId", controlId);
                const res = await fetch(`/api/t/${tenantSlug}/evidence/uploads`, { method: "POST", body: fd });
                if (!res.ok) throw new Error("Upload failed");
            } else if (url.trim()) {
                const res = await fetch(`/api/t/${tenantSlug}/controls/${controlId}/evidence`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ kind: "LINK", url: url.trim() }),
                });
                if (!res.ok) throw new Error("Failed to link evidence");
            } else {
                setErr("Choose a file or enter a URL.");
                return;
            }
            setFile(null);
            setTitle("");
            setUrl("");
            if (fileRef.current) fileRef.current.value = "";
            await load();
        } catch (e2) {
            setErr(e2 instanceof Error ? e2.message : "Failed");
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-default rounded-lg border border-border-subtle bg-bg-subtle/40 p-3" data-testid="control-evidence-box">
            <p className="text-[11px] font-medium uppercase tracking-wide text-content-subtle">Evidence</p>
            {canWrite && (
                <form onSubmit={submit} className="space-y-tight" data-testid="control-evidence-form">
                    <input
                        ref={fileRef}
                        type="file"
                        className="block w-full text-xs text-content-muted file:mr-2 file:cursor-pointer file:rounded file:border-0 file:bg-bg-muted file:px-2 file:py-1 file:text-content-default"
                        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        data-testid="control-evidence-file"
                    />
                    {file && (
                        <input
                            type="text"
                            className="input w-full"
                            placeholder="Title (optional)"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                        />
                    )}
                    <div className="flex items-center gap-tight text-[10px] uppercase text-content-subtle">or</div>
                    <input
                        type="url"
                        className="input w-full"
                        placeholder="Evidence URL"
                        value={url}
                        onChange={(e) => setUrl(e.target.value)}
                        data-testid="control-evidence-url"
                    />
                    {err && <p className="text-xs text-content-error">{err}</p>}
                    <Button
                        type="submit"
                        variant="secondary"
                        size="sm"
                        disabled={busy || (!file && !url.trim())}
                        data-testid="control-evidence-submit"
                        text={busy ? "Uploading…" : "Add evidence"}
                    />
                </form>
            )}
            {items === null ? (
                <p className="text-xs text-content-subtle">Loading evidence…</p>
            ) : items.length === 0 ? (
                <p className="text-xs text-content-subtle">No evidence attached.</p>
            ) : (
                <ul className="space-y-tight">
                    {items.map((it) => (
                        <li key={it.id} className="flex items-center gap-tight text-xs">
                            <StatusBadge size="sm" variant={it.kind === "FILE" ? "success" : "info"}>
                                {it.kind}
                            </StatusBadge>
                            {it.url ? (
                                <a
                                    href={it.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="min-w-0 flex-1 truncate text-[var(--brand-default)] hover:opacity-80"
                                >
                                    {it.title}
                                </a>
                            ) : (
                                <span className="min-w-0 flex-1 truncate text-content-default">{it.title}</span>
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
