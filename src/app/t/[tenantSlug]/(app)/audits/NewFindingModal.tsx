'use client';

/**
 * NewFindingModal — feat/audit-cycle-unify.
 *
 * Create-finding affordance on the audit surface. Findings were
 * previously display-only on the audit detail pane; this modal lets a
 * writer raise a finding directly against the currently-open audit
 * (auditId prefilled) via the canonical POST /api/t/:slug/findings API.
 * On success the parent audit is reloaded so the new finding appears.
 *
 * Deliberately slim — reuses the finding form's core fields
 * (title / type / severity / description). Assignee, controls, and risk
 * links stay on the full Findings-list create modal.
 */
import {
    useEffect,
    useMemo,
    useState,
    type Dispatch,
    type SetStateAction,
} from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

export interface NewFindingModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    auditId: string;
    apiUrl: (path: string) => string;
    /** Called after a successful create so the parent can reload the audit. */
    onCreated?: () => void;
}

const EMPTY = {
    title: '',
    description: '',
    type: 'NONCONFORMITY',
    severity: 'MEDIUM',
};

export function NewFindingModal({
    open,
    setOpen,
    auditId,
    apiUrl,
    onCreated,
}: NewFindingModalProps) {
    const tx = useTranslations('audits');
    const [form, setForm] = useState({ ...EMPTY });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const typeOptions = useMemo<ComboboxOption[]>(
        () =>
            ['NONCONFORMITY', 'OBSERVATION', 'OPPORTUNITY'].map((v) => ({
                value: v,
                label: tx(`findingModal.typeOptions.${v}`),
            })),
        [tx],
    );
    const severityOptions = useMemo<ComboboxOption[]>(
        () =>
            ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].map((v) => ({
                value: v,
                label: tx(`findingModal.severityOptions.${v}`),
            })),
        [tx],
    );

    useEffect(() => {
        if (!open) return;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm({ ...EMPTY });
        setError('');
        setSubmitting(false);
    }, [open]);

    const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
        setForm((prev) => ({ ...prev, [field]: value }));

    const canSubmit =
        form.title.trim().length > 0 && form.description.trim().length > 0 && !submitting;

    const close = () => {
        if (!submitting) setOpen(false);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSubmitting(true);
        setError('');
        try {
            const res = await fetch(apiUrl('/findings'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    auditId,
                    title: form.title.trim(),
                    description: form.description.trim(),
                    type: form.type,
                    severity: form.severity,
                }),
            });
            if (!res.ok) {
                const data = await res.json().catch(() => ({}));
                throw new Error(data.message || data.error || tx('findingModal.createFailed'));
            }
            setOpen(false);
            onCreated?.();
        } catch (err) {
            setError(err instanceof Error ? err.message : tx('findingModal.createFailed'));
            setSubmitting(false);
        }
    };

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="md"
            title={tx('findingModal.title')}
            description={tx('findingModal.description')}
            preventDefaultClose={submitting}
        >
            <Modal.Header
                title={tx('findingModal.title')}
                description={tx('findingModal.description')}
            />
            <Modal.Form id="new-audit-finding-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    {error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="new-audit-finding-error"
                            role="alert"
                        >
                            {error}
                        </div>
                    )}
                    <fieldset disabled={submitting} className="m-0 border-0 p-0 space-y-default">
                        <FormField label={tx('findingModal.labelTitle')} required>
                            <Input
                                id="audit-finding-title"
                                type="text"
                                placeholder={tx('findingModal.placeholderTitle')}
                                value={form.title}
                                onChange={(e) => update('title', e.target.value)}
                                required
                                autoComplete="off"
                            />
                        </FormField>

                        <div className="grid grid-cols-1 gap-default sm:grid-cols-2">
                            <FormField label={tx('findingModal.labelType')}>
                                <Combobox
                                    id="audit-finding-type"
                                    options={typeOptions}
                                    selected={typeOptions.find((o) => o.value === form.type) ?? null}
                                    setSelected={(o) => update('type', o?.value ?? 'NONCONFORMITY')}
                                    hideSearch
                                    matchTriggerWidth
                                    buttonProps={{ className: 'w-full' }}
                                    caret
                                />
                            </FormField>
                            <FormField label={tx('findingModal.labelSeverity')}>
                                <Combobox
                                    id="audit-finding-severity"
                                    options={severityOptions}
                                    selected={severityOptions.find((o) => o.value === form.severity) ?? null}
                                    setSelected={(o) => update('severity', o?.value ?? 'MEDIUM')}
                                    hideSearch
                                    matchTriggerWidth
                                    buttonProps={{ className: 'w-full' }}
                                    caret
                                />
                            </FormField>
                        </div>

                        <FormField label={tx('findingModal.labelDescription')} required>
                            <Textarea
                                id="audit-finding-description"
                                rows={3}
                                placeholder={tx('findingModal.placeholderDescription')}
                                value={form.description}
                                onChange={(e) => update('description', e.target.value)}
                                required
                            />
                        </FormField>
                    </fieldset>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={close}
                        disabled={submitting}
                        id="new-audit-finding-cancel-btn"
                    >
                        {tx('findingModal.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!canSubmit}
                        id="submit-audit-finding"
                    >
                        {submitting ? tx('findingModal.creating') : tx('findingModal.submit')}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
