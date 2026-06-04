/**
 * Elevation PR-2 — first decomposition extraction.
 *
 * The control detail page (`page.tsx`) was 1506 lines. This file
 * extracts the Edit Control modal into a presentational sub-
 * component. The page still owns the mutation + state; the modal
 * is a thin renderer.
 *
 * Pattern for future extractions:
 *   - State + mutation stay in the page (coupled to pageDataKey).
 *   - Sub-component takes everything via props.
 *   - File lives under `_modals/` (or `_tabs/`) so Next.js doesn't
 *     treat it as a route.
 *
 * Future PRs should extract: OverviewTab, TasksTab, EvidenceTab,
 * MappingsTab, ActivityTab using the same pattern.
 */
'use client';

import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Modal } from '@/components/ui/modal';
import { RequiredMarker } from '@/components/ui/required-marker';

export interface EditControlForm {
    name: string;
    description: string;
    intent: string;
    category: string;
    frequency: string;
    owner: string;
    automationType: string;
    mitigationType: string;
}

const AUTOMATION_TYPE_OPTIONS: ComboboxOption[] = [
    { value: 'AUTOMATED', label: 'Automated' },
    { value: 'MANUAL', label: 'Manual' },
    { value: 'IT_DEPENDENT_MANUAL', label: 'IT-Dependent Manual' },
];

const MITIGATION_TYPE_OPTIONS: ComboboxOption[] = [
    { value: 'PREVENTIVE', label: 'Preventive' },
    { value: 'DETECTIVE', label: 'Detective' },
    { value: 'DETERRENT', label: 'Deterrent' },
    { value: 'CORRECTIVE', label: 'Corrective' },
    { value: 'COMPENSATING', label: 'Compensating' },
];

export interface EditControlModalProps {
    open: boolean;
    setOpen: (next: boolean) => void;
    form: EditControlForm;
    setForm: React.Dispatch<React.SetStateAction<EditControlForm>>;
    saving: boolean;
    error: string;
    currentOwnerName: string | null | undefined;
    categoryOptions: ComboboxOption[];
    frequencyOptions: ComboboxOption[];
    onCancel: () => void;
    onSubmit: (e: React.FormEvent) => void | Promise<void>;
}

export function EditControlModal({
    open,
    setOpen,
    form,
    setForm,
    saving,
    error,
    currentOwnerName,
    categoryOptions,
    frequencyOptions,
    onCancel,
    onSubmit,
}: EditControlModalProps) {
    return (
        <Modal
            showModal={open}
            setShowModal={(v) => {
                const next = typeof v === 'function' ? v(open) : v;
                if (!next && !saving) onCancel();
                else setOpen(next);
            }}
            size="lg"
            title="Edit Control"
            description="Update the control's metadata."
            preventDefaultClose={saving}
        >
            <Modal.Header
                title="Edit Control"
                description="Update the control's metadata."
            />
            <Modal.Form
                onSubmit={onSubmit}
                id="control-edit-dialog"
                data-testid="control-edit-dialog"
            >
                <Modal.Body>
                    {error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            role="alert"
                            data-testid="edit-error"
                        >
                            {error}
                        </div>
                    )}
                    <fieldset className="space-y-default" disabled={saving}>
                        <div>
                            <label
                                htmlFor="edit-name"
                                className="mb-1 block text-sm text-content-default"
                            >
                                Title <RequiredMarker />
                            </label>
                            <input
                                id="edit-name"
                                type="text"
                                className="input w-full"
                                value={form.name}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        name: e.target.value,
                                    }))
                                }
                                required
                                minLength={3}
                                data-testid="edit-name-input"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="edit-description"
                                className="mb-1 block text-sm text-content-default"
                            >
                                Description
                            </label>
                            <textarea
                                id="edit-description"
                                className="input w-full"
                                rows={3}
                                value={form.description}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        description: e.target.value,
                                    }))
                                }
                                data-testid="edit-description-input"
                            />
                        </div>
                        <div>
                            <label
                                htmlFor="edit-intent"
                                className="mb-1 block text-sm text-content-default"
                            >
                                Intent
                            </label>
                            <textarea
                                id="edit-intent"
                                className="input w-full"
                                rows={2}
                                value={form.intent}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        intent: e.target.value,
                                    }))
                                }
                                data-testid="edit-intent-input"
                            />
                        </div>
                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="edit-category"
                                    className="mb-1 block text-sm text-content-default"
                                >
                                    Category
                                </label>
                                <Combobox
                                    hideSearch
                                    forceDropdown
                                    id="edit-category"
                                    selected={
                                        categoryOptions.find(
                                            (o) => o.value === form.category,
                                        ) ?? null
                                    }
                                    setSelected={(opt) =>
                                        setForm((f) => ({
                                            ...f,
                                            category: opt?.value ?? '',
                                        }))
                                    }
                                    options={categoryOptions}
                                    placeholder="— None —"
                                    matchTriggerWidth
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="edit-frequency"
                                    className="mb-1 block text-sm text-content-default"
                                >
                                    Frequency
                                </label>
                                <Combobox
                                    hideSearch
                                    forceDropdown
                                    id="edit-frequency"
                                    selected={
                                        frequencyOptions.find(
                                            (o) => o.value === form.frequency,
                                        ) ?? null
                                    }
                                    setSelected={(opt) =>
                                        setForm((f) => ({
                                            ...f,
                                            frequency: opt?.value ?? '',
                                        }))
                                    }
                                    options={frequencyOptions}
                                    placeholder="— None —"
                                    matchTriggerWidth
                                />
                            </div>
                        </div>
                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <div>
                                <label
                                    htmlFor="edit-automation-type"
                                    className="mb-1 block text-sm text-content-default"
                                >
                                    Automation Type
                                </label>
                                <Combobox
                                    hideSearch
                                    forceDropdown
                                    id="edit-automation-type"
                                    selected={
                                        AUTOMATION_TYPE_OPTIONS.find(
                                            (o) => o.value === form.automationType,
                                        ) ?? null
                                    }
                                    setSelected={(opt) =>
                                        setForm((f) => ({
                                            ...f,
                                            automationType: opt?.value ?? '',
                                        }))
                                    }
                                    options={AUTOMATION_TYPE_OPTIONS}
                                    placeholder="— None —"
                                    matchTriggerWidth
                                />
                            </div>
                            <div>
                                <label
                                    htmlFor="edit-mitigation-type"
                                    className="mb-1 block text-sm text-content-default"
                                >
                                    Mitigation Type
                                </label>
                                <Combobox
                                    hideSearch
                                    forceDropdown
                                    id="edit-mitigation-type"
                                    selected={
                                        MITIGATION_TYPE_OPTIONS.find(
                                            (o) => o.value === form.mitigationType,
                                        ) ?? null
                                    }
                                    setSelected={(opt) =>
                                        setForm((f) => ({
                                            ...f,
                                            mitigationType: opt?.value ?? '',
                                        }))
                                    }
                                    options={MITIGATION_TYPE_OPTIONS}
                                    placeholder="— None —"
                                    matchTriggerWidth
                                />
                            </div>
                        </div>
                        <div>
                            <label
                                htmlFor="edit-owner"
                                className="mb-1 block text-sm text-content-default"
                            >
                                Owner
                            </label>
                            <input
                                id="edit-owner"
                                type="text"
                                className="input w-full"
                                placeholder="User ID (leave empty to clear)"
                                value={form.owner}
                                onChange={(e) =>
                                    setForm((f) => ({
                                        ...f,
                                        owner: e.target.value,
                                    }))
                                }
                                data-testid="edit-owner-input"
                            />
                            {currentOwnerName && (
                                <p className="mt-1 text-xs text-content-muted">
                                    Current: {currentOwnerName}
                                </p>
                            )}
                        </div>
                    </fieldset>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onCancel}
                        disabled={saving}
                        data-testid="edit-cancel-button"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={saving || form.name.trim().length < 3}
                        data-testid="edit-save-button"
                    >
                        {saving ? 'Saving...' : 'Save'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
