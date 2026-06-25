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
import { useState } from "react";
import { Heading } from "@/components/ui/typography";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { Combobox, type ComboboxOption } from "@/components/ui/combobox";
import { UserCombobox } from "@/components/ui/user-combobox";
import { FormField } from "@/components/ui/form-field";
import { RequiredMarker } from "@/components/ui/required-marker";
import { EvidenceUploadSection } from "@/components/evidence/EvidenceUploadSection";
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
                                    buttonProps={{ className: "w-full", size: "sm" }}
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
                                    buttonProps={{ className: "w-full", size: "sm" }}
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

                    {/* Drag-and-drop evidence upload (canonical FileDropzone). */}
                    <EvidenceUploadSection
                        tenantSlug={tenantSlug}
                        linkField="controlId"
                        linkId={control.id}
                        canWrite={canWrite}
                        listEndpoint={`/controls/${control.id}/evidence`}
                        urlLinkEndpoint={`/controls/${control.id}/evidence`}
                        urlLinkBody={(url, note) => ({ kind: "LINK", url, note: note || undefined })}
                    />
                </div>
            ) : (
                <PanelActivityFeed tenantSlug={tenantSlug} endpoint={`/controls/${control.id}/activity`} />
            )}
        </div>
    );
}
