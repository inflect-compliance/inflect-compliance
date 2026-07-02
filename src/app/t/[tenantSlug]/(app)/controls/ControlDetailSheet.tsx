'use client';
/* TODO(swr-migration): this file has fetch-on-mount + setState
 * patterns flagged by react-hooks/set-state-in-effect. Each call site
 * carries an inline disable directive; collectively they should
 * migrate to useTenantSWR (Epic 69 shape) so the rule can lift. */

/**
 * Epic 54 — Control quick-inspect / edit Sheet.
 *
 * Side-panel detail view for the common-case inspect + edit flow on the
 * Controls list. The full control detail page (`/controls/[controlId]`)
 * keeps ownership of the deep tabs (evidence, tasks, related, applicability
 * workflows) — this Sheet is the *fast* contextual path that replaces
 * full-page navigation for routine edits: name, category, frequency,
 * owner. The list stays visible behind the Sheet so
 * filters, scroll position, and pagination survive the edit.
 *
 * Business behaviour is identical to the legacy modal on the detail page:
 *   - PATCH /controls/:id with name/category/frequency.
 *   - POST  /controls/:id/owner when the owner actually changed.
 *   - Success → invalidate controls.all(tenantSlug) so the list reflects
 *     the new name/owner immediately, then close the Sheet.
 *
 * The Sheet is a "edit-first" model: fields are rendered as standard
 * inputs pre-populated with the current values, plus a small read-only
 * summary card (code / annex / status / applicability) so users keep
 * context of what they're editing. Status + applicability have their
 * own dedicated pills on the list row (Epic 52) so editing them is
 * intentionally not inlined here — keeps this surface focused and
 * avoids re-implementing the justification modal.
 */

import Link from 'next/link';
import { useSWRConfig } from 'swr';
import { useTenantSWR } from '@/lib/hooks/use-tenant-swr';
import { useEffect, useMemo, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { Sheet } from '@/components/ui/sheet';
import { Button, buttonVariants } from '@/components/ui/button';
import { StatusBadge, type StatusBadgeVariant } from '@/components/ui/status-badge';
import { UserCombobox } from '@/components/ui/user-combobox';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { RequiredMarker } from '@/components/ui/required-marker';
import { CACHE_KEYS } from '@/lib/swr-keys';
import { extractMutationError } from '@/lib/mutations';

// ─── Types ──────────────────────────────────────────────────────────

interface ControlDetailResponse {
    id: string;
    code: string | null;
    annexId: string | null;
    name: string;
    category: string | null;
    frequency: string | null;
    status: string;
    applicability: string;
    ownerUserId: string | null;
    owner: { id: string; name: string | null; email: string | null } | null;
}

type EditForm = {
    name: string;
    category: string;
    frequency: string;
    owner: string;
};

// ─── Static labels (match the existing detail page) ─────────────────

const STATUS_BADGE: Record<string, StatusBadgeVariant> = {
    NOT_STARTED: 'neutral',
    PLANNED: 'info',
    IN_PROGRESS: 'info',
    IMPLEMENTING: 'info',
    IMPLEMENTED: 'success',
    NEEDS_REVIEW: 'warning',
    NOT_APPLICABLE: 'neutral',
};

const FREQUENCY_OPTIONS: ComboboxOption[] = [
    { value: 'AD_HOC', label: 'Ad Hoc' },
    { value: 'DAILY', label: 'Daily' },
    { value: 'WEEKLY', label: 'Weekly' },
    { value: 'MONTHLY', label: 'Monthly' },
    { value: 'QUARTERLY', label: 'Quarterly' },
    { value: 'ANNUALLY', label: 'Annually' },
];

const CATEGORY_OPTIONS: ComboboxOption[] = [
    { value: 'Access Control', label: 'Access Control' },
    { value: 'Encryption', label: 'Encryption' },
    { value: 'Network Security', label: 'Network Security' },
    { value: 'Physical Security', label: 'Physical Security' },
    { value: 'HR Security', label: 'HR Security' },
    { value: 'Operations', label: 'Operations' },
    { value: 'Compliance', label: 'Compliance' },
    { value: 'Incident Management', label: 'Incident Management' },
    { value: 'Business Continuity', label: 'Business Continuity' },
    { value: 'Other', label: 'Other' },
];

// ─── Props ──────────────────────────────────────────────────────────

export interface ControlDetailSheetProps {
    /** Open when non-null; the value is the control id being edited. */
    controlId: string | null;
    setControlId: Dispatch<SetStateAction<string | null>>;
    tenantSlug: string;
    /** Helper to build tenant-scoped API URLs. */
    apiUrl: (path: string) => string;
    /** Helper to build tenant-scoped app URLs (for "Open full detail"). */
    tenantHref: (path: string) => string;
    /** Gate the edit controls behind the caller's write permission. */
    canWrite: boolean;
}

// ─── Component ──────────────────────────────────────────────────────

export function ControlDetailSheet({
    controlId,
    setControlId,
    tenantSlug,
    apiUrl,
    tenantHref,
    canWrite,
}: ControlDetailSheetProps) {
    const open = controlId !== null;
    const { mutate: swrMutate } = useSWRConfig();
    const nameInputRef = useRef<HTMLInputElement>(null);

    // ── Load the control ──
    // Conditional fetch via the null-key idiom (skips when closed). Shares
    // the `controls.detail(id)` key so reads dedupe across openings.
    const detailQuery = useTenantSWR<ControlDetailResponse>(
        controlId ? CACHE_KEYS.controls.detail(controlId) : null,
    );

    const control = detailQuery.data;

    // ── Local edit state, seeded from server data on each (re)open ──
    const [form, setForm] = useState<EditForm>({
        name: '',
        category: '',
        frequency: '',
        owner: '',
    });
    const [dirty, setDirty] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!control) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm({
            name: control.name || '',
            category: control.category || '',
            frequency: control.frequency || '',
            owner: control.ownerUserId || '',
        });
        setDirty(false);
        setError('');
    }, [control?.id, control?.name, control?.category, control?.frequency, control?.ownerUserId]);

    // Focus the name input shortly after open so users can start typing.
    useEffect(() => {
        if (!open || !control) return;
        const t = setTimeout(() => nameInputRef.current?.focus(), 80);
        return () => clearTimeout(t);
    }, [open, control?.id]);

    const update = (field: keyof EditForm, value: string) => {
        setForm((prev) => ({ ...prev, [field]: value }));
        setDirty(true);
    };

    // ── Save edits ──
    const [saving, setSaving] = useState(false);
    const handleSave = async (draft: EditForm) => {
        if (!controlId) return;
        setSaving(true);
        setError('');
        try {
            const res = await fetch(apiUrl(`/controls/${controlId}`), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: draft.name.trim(),
                    category: draft.category.trim() || null,
                    frequency: draft.frequency || null,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(extractMutationError(data, 'Update failed'));
            }
            // Owner lives on a dedicated endpoint — only fire when it changed.
            const originalOwner = control?.ownerUserId || '';
            if (draft.owner.trim() !== originalOwner) {
                const ownerRes = await fetch(apiUrl(`/controls/${controlId}/owner`), {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ownerUserId: draft.owner.trim() || null }),
                });
                if (!ownerRes.ok) {
                    const data = await ownerRes.json().catch(() => ({}));
                    throw new Error(extractMutationError(data, 'Owner update failed'));
                }
            }
            // Revalidate this Sheet's detail cache, the full detail page's
            // page-data cache, and every variant of the controls list key —
            // so the edit shows everywhere without a manual reload.
            await detailQuery.mutate();
            const listPrefix = apiUrl(CACHE_KEYS.controls.list());
            swrMutate(
                (key) =>
                    typeof key === 'string' &&
                    (key === listPrefix || key.startsWith(`${listPrefix}?`)),
                undefined,
                { revalidate: true },
            );
            swrMutate(apiUrl(CACHE_KEYS.controls.pageData(controlId)));
            setControlId(null);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Update failed');
        } finally {
            setSaving(false);
        }
    };

    const canSave = canWrite && dirty && form.name.trim().length >= 3 && !saving;

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSave) return;
        setError('');
        void handleSave(form);
    };

    // Guard against dropping unsaved edits on accidental close.
    const handleOpenChange = (next: boolean) => {
        if (next) return;
        if (dirty && !saving) {
            const ok = typeof window !== 'undefined'
                ? window.confirm('Discard unsaved changes?')
                : true;
            if (!ok) return;
        }
        setControlId(null);
    };

    // ── Summary chips (read-only context) ──
    const summary = useMemo(() => {
        if (!control) return [] as { label: string; value: string; badge?: StatusBadgeVariant }[];
        const rows: { label: string; value: string; badge?: StatusBadgeVariant }[] = [];
        if (control.code || control.annexId) {
            rows.push({ label: 'Code', value: control.annexId || control.code || '—' });
        }
        rows.push({
            label: 'Status',
            value: control.status.replace(/_/g, ' '),
            badge: STATUS_BADGE[control.status] || 'neutral',
        });
        rows.push({
            label: 'Applicability',
            value: control.applicability === 'NOT_APPLICABLE' ? 'N/A' : 'Yes',
            badge: control.applicability === 'NOT_APPLICABLE' ? 'warning' : 'success',
        });
        if (control.owner?.name) {
            rows.push({ label: 'Owner', value: control.owner.name });
        }
        return rows;
    }, [control]);

    return (
        <Sheet
            open={open}
            onOpenChange={handleOpenChange}
            size="md"
            title={control?.name ?? 'Control detail'}
            description={control?.annexId ?? control?.code ?? undefined}
        >
            {detailQuery.isLoading || !control ? (
                <>
                    <Sheet.Header title="Loading…" />
                    <Sheet.Body>
                        <div className="flex h-40 items-center justify-center text-sm text-content-muted">
                            Loading control…
                        </div>
                    </Sheet.Body>
                </>
            ) : detailQuery.error ? (
                <>
                    <Sheet.Header title="Control" />
                    <Sheet.Body>
                        <div
                            className="rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            role="alert"
                            data-testid="control-sheet-error"
                        >
                            {detailQuery.error instanceof Error
                                ? detailQuery.error.message
                                : 'Failed to load control.'}
                        </div>
                    </Sheet.Body>
                </>
            ) : (
                <>
                    <Sheet.Header
                        title={control.name}
                        description={control.annexId || control.code || undefined}
                    />
                    <form
                        onSubmit={handleSubmit}
                        className="flex flex-1 flex-col overflow-hidden"
                        data-testid="control-sheet-form"
                    >
                        <Sheet.Body>
                            {/* Read-only summary */}
                            <section
                                className="mb-5 grid grid-cols-2 gap-compact rounded-lg border border-border-subtle bg-bg-subtle px-4 py-3"
                                data-testid="control-sheet-summary"
                            >
                                {summary.map((row) => (
                                    <div key={row.label} className="flex flex-col gap-0.5">
                                        <span className="text-xs uppercase tracking-wide text-content-muted">
                                            {row.label}
                                        </span>
                                        {row.badge ? (
                                            <StatusBadge variant={row.badge} className="w-fit">
                                                {row.value}
                                            </StatusBadge>
                                        ) : (
                                            <span className="text-sm text-content-emphasis">
                                                {row.value}
                                            </span>
                                        )}
                                    </div>
                                ))}
                            </section>

                            {error && (
                                <div
                                    className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                                    role="alert"
                                    data-testid="control-sheet-save-error"
                                >
                                    {error}
                                </div>
                            )}

                            <fieldset className="space-y-default" disabled={!canWrite || saving}>
                                <div>
                                    <label
                                        className="mb-1 block text-sm text-content-default"
                                        htmlFor="sheet-name-input"
                                    >
                                        Name <RequiredMarker />
                                    </label>
                                    <input
                                        id="sheet-name-input"
                                        ref={nameInputRef}
                                        type="text"
                                        className="input w-full"
                                        data-testid="sheet-name-input"
                                        value={form.name}
                                        onChange={(e) => update('name', e.target.value)}
                                        required
                                        minLength={3}
                                    />
                                </div>
                                <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                                    <div>
                                        <label
                                            className="mb-1 block text-sm text-content-default"
                                            htmlFor="sheet-category-input"
                                        >
                                            Category
                                        </label>
                                        <Combobox
                                            id="sheet-category-input"
                                            name="category"
                                            options={CATEGORY_OPTIONS}
                                            selected={CATEGORY_OPTIONS.find(o => o.value === form.category) ?? null}
                                            setSelected={(o) => update('category', o?.value ?? '')}
                                            placeholder="—"
                                            searchPlaceholder="Search categories…"
                                            disabled={!canWrite}
                                            matchTriggerWidth
                                            forceDropdown
                                            buttonProps={{ className: 'w-full' }}
                                            caret
                                        />
                                    </div>
                                    <div>
                                        <label
                                            className="mb-1 block text-sm text-content-default"
                                            htmlFor="sheet-frequency-input"
                                        >
                                            Frequency
                                        </label>
                                        <Combobox
                                            id="sheet-frequency-input"
                                            name="frequency"
                                            options={FREQUENCY_OPTIONS}
                                            selected={FREQUENCY_OPTIONS.find(o => o.value === form.frequency) ?? null}
                                            setSelected={(o) => update('frequency', o?.value ?? '')}
                                            placeholder="—"
                                            disabled={!canWrite}
                                            hideSearch
                                            matchTriggerWidth
                                            forceDropdown
                                            buttonProps={{ className: 'w-full' }}
                                            caret
                                        />
                                    </div>
                                </div>
                                <FormField
                                    label="Owner"
                                    description="Search members to assign, or clear to unassign."
                                >
                                    <UserCombobox
                                        id="sheet-owner-input"
                                        name="ownerUserId"
                                        tenantSlug={tenantSlug}
                                        disabled={!canWrite}
                                        selectedId={form.owner || null}
                                        onChange={(userId) =>
                                            update('owner', userId ?? '')
                                        }
                                        placeholder={
                                            control.owner?.name ||
                                            control.owner?.email ||
                                            'Unassigned'
                                        }
                                    />
                                </FormField>
                            </fieldset>
                        </Sheet.Body>
                        <Sheet.Actions align="between">
                            <Link
                                href={tenantHref(`/controls/${control.id}`)}
                                className={buttonVariants({ variant: 'ghost', size: 'sm' })}
                                data-testid="control-sheet-open-full"
                                onClick={() => setControlId(null)}
                            >
                                Open full detail →
                            </Link>
                            <div className="flex items-center gap-tight">
                                <Sheet.Close asChild>
                                    <Button
                                        type="button"
                                        variant="secondary"
                                        size="sm"
                                        data-testid="control-sheet-cancel"
                                        text="Cancel"
                                    />
                                </Sheet.Close>
                                <Button
                                    type="submit"
                                    variant="primary"
                                    size="sm"
                                    data-testid="control-sheet-save"
                                    disabled={!canSave}
                                    text={saving ? 'Saving…' : 'Save changes'}
                                />
                            </div>
                        </Sheet.Actions>
                    </form>
                </>
            )}
        </Sheet>
    );
}
