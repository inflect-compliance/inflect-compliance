/**
 * Control detail page — Tasks tab — "+ Task" affordance migrates
 * from an inline `<form>` to a modal. Matches the EditControlModal
 * extraction pattern: the page still owns state + mutation, the
 * modal is a thin presentational renderer that takes everything
 * via props.
 *
 * Before: clicking "+ Task" toggled an in-page card with the form
 * fields right above the Tasks DataTable. That broke the visual
 * model — the user was already in the Tasks tab, but the form sat
 * outside the table chrome and competed with the rows for attention.
 *
 * After: the click opens a modal. The Tasks tab stays at rest;
 * the user fills out the modal, hits Create, the modal closes,
 * the table refreshes with the new row. Matches the canonical
 * "create-flow as modal" pattern documented in
 * `docs/modal-sheet-strategy.md`.
 *
 * Why a sibling module under `_modals/`:
 *   The parent page is already 1200+ lines and Next.js skips
 *   `_<dirname>/` so it doesn't treat the file as a route. Same
 *   pattern as EditControlModal — keep extractions adjacent to
 *   the page they came from.
 */
'use client';

import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker/date-picker';
import { FormField } from '@/components/ui/form-field';
import { Modal } from '@/components/ui/modal';
import { parseYMD, startOfUtcDay, toYMD } from '@/components/ui/date-picker/date-utils';

export interface NewControlTaskModalProps {
    open: boolean;
    setOpen: (next: boolean) => void;
    /** Bound to the page's task-title state. */
    title: string;
    setTitle: (next: string) => void;
    /** Bound to the page's task-description state. */
    description: string;
    setDescription: (next: string) => void;
    /** YYYY-MM-DD or empty string. */
    dueAt: string;
    setDueAt: (next: string) => void;
    /** True while the POST is in flight. Disables fields + submit. */
    saving: boolean;
    /** Submit handler. Owns the POST + refetch + close. */
    onSubmit: (e: React.FormEvent) => void | Promise<void>;
    /** Cancel handler. Resets fields + closes (caller's choice). */
    onCancel: () => void;
}

export function NewControlTaskModal({
    open,
    setOpen,
    title,
    setTitle,
    description,
    setDescription,
    dueAt,
    setDueAt,
    saving,
    onSubmit,
    onCancel,
}: NewControlTaskModalProps) {
    return (
        <Modal
            showModal={open}
            setShowModal={(v) => {
                const next = typeof v === 'function' ? v(open) : v;
                if (!next && !saving) onCancel();
                else setOpen(next);
            }}
            size="md"
            title="Create Task"
            description="Add a task linked to this control."
            preventDefaultClose={saving}
        >
            <Modal.Header
                title="Create Task"
                description="Add a task linked to this control."
            />
            <Modal.Form
                onSubmit={onSubmit}
                id="control-task-create-dialog"
                data-testid="control-task-create-dialog"
            >
                <Modal.Body>
                    <fieldset className="space-y-default" disabled={saving}>
                        <FormField label="Title" required>
                            <input
                                id="task-title-input"
                                type="text"
                                className="input w-full"
                                placeholder="Task title"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                required
                                minLength={1}
                                autoFocus
                                data-testid="task-title-input"
                            />
                        </FormField>
                        <FormField label="Description">
                            <textarea
                                id="task-desc-input"
                                className="input w-full"
                                rows={3}
                                placeholder="Optional"
                                value={description}
                                onChange={(e) =>
                                    setDescription(e.target.value)
                                }
                                data-testid="task-desc-input"
                            />
                        </FormField>
                        <FormField label="Due date">
                            <DatePicker
                                id="task-due-input"
                                className="w-full"
                                placeholder="Pick a date"
                                clearable
                                align="start"
                                value={parseYMD(dueAt)}
                                onChange={(next) =>
                                    setDueAt(toYMD(next) ?? '')
                                }
                                disabledDays={{
                                    before: startOfUtcDay(new Date()),
                                }}
                                aria-label="Task due date"
                            />
                        </FormField>
                    </fieldset>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={onCancel}
                        disabled={saving}
                        data-testid="task-cancel-button"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={saving || title.trim().length === 0}
                        data-testid="submit-task-btn"
                    >
                        {saving ? 'Creating...' : 'Create'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
