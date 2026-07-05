'use client';

/**
 * NewPolicyModal — modal-form P2 execution.
 *
 * Mounts the P1-extracted `useNewPolicyForm` hook + `<NewPolicyFields>`
 * markup inside a `<Modal>` shell. Composes the canonical NewRiskModal
 * pattern (Epic 54 precedent): `Modal.Form` wraps the body + actions
 * so submit fires from the pinned Cancel/Create row.
 *
 * The legacy `/policies/new` route survives as a thin redirect →
 * `/policies?create=1`; the list page (PoliciesClient) reads the flag
 * on mount and opens this modal.
 */
import { useCallback, useMemo, type Dispatch, type SetStateAction } from 'react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useTenantHref } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { FormField } from '@/components/ui/form-field';
import { useNewPolicyForm } from './_form/useNewPolicyForm';
import { NewPolicyFields } from './_form/NewPolicyFields';

export interface NewPolicyModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    /** When true, the modal opens in template-picker mode. */
    isTemplateMode?: boolean;
}

export function NewPolicyModal({
    open,
    setOpen,
    isTemplateMode = false,
}: NewPolicyModalProps) {
    const tenantHref = useTenantHref();
    const router = useRouter();
    const t = useTranslations('policies');

    // The "Start with" selector at the top of the modal. "New" keeps the blank
    // policy form below; "From template" navigates to the templates page.
    const createModeOptions = useMemo<ComboboxOption[]>(
        () => [
            { value: 'new', label: t('new.modeNew') },
            { value: 'from-template', label: t('new.modeFromTemplate') },
        ],
        [t],
    );

    const form = useNewPolicyForm({
        isTemplateMode,
        onSuccess: (policy) => {
            setOpen(false);
            router.push(tenantHref(`/policies/${policy.id}`));
        },
    });

    // P3 — unsaved-changes warning. Every close path (Cancel button,
    // X, Escape, outside click) routes through `guardedSetOpen` —
    // Radix's `onOpenChange` (wired via `setShowModal`) fires the same
    // setter, so the warning catches all of them uniformly.
    const guardedSetOpen = useCallback<Dispatch<SetStateAction<boolean>>>(
        (next) => {
            const wantClose =
                typeof next === 'function' ? !next(true) : next === false;
            if (wantClose) {
                if (form.submitting) return;
                if (
                    form.isDirty &&
                    !window.confirm(t('new.discard'))
                ) {
                    return;
                }
            }
            setOpen(next);
        },
        [form.submitting, form.isDirty, setOpen, t],
    );
    const close = () => guardedSetOpen(false);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void form.submit();
    };

    return (
        <Modal
            showModal={open}
            setShowModal={guardedSetOpen}
            size="lg"
            title={isTemplateMode ? t('new.titleTemplate') : t('new.titleBlank')}
            description={
                isTemplateMode ? t('new.descTemplate') : t('new.descBlank')
            }
            preventDefaultClose={form.submitting}
        >
            <Modal.Header
                title={isTemplateMode ? t('new.titleTemplate') : t('new.titleBlank')}
                description={
                    isTemplateMode ? t('new.descTemplate') : t('new.descBlank')
                }
            />
            <Modal.Form id="new-policy-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    <div className="mb-default">
                        <FormField label={t('new.startWith')}>
                            <Combobox
                                id="new-policy-mode"
                                name="newPolicyMode"
                                options={createModeOptions}
                                selected={createModeOptions[0]}
                                setSelected={(o) => {
                                    if (o?.value === 'from-template') {
                                        // Jump to the templates page — the
                                        // dedicated from-template surface.
                                        setOpen(false);
                                        router.push(
                                            tenantHref('/policies/templates'),
                                        );
                                    }
                                }}
                                placeholder={t('new.modePlaceholder')}
                                hideSearch
                                matchTriggerWidth
                                forceDropdown
                                buttonProps={{ className: 'w-full' }}
                                caret
                            />
                        </FormField>
                    </div>
                    {form.error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="new-policy-error"
                            role="alert"
                        >
                            {form.error}
                        </div>
                    )}
                    <fieldset
                        disabled={form.submitting}
                        className="m-0 p-0 border-0 space-y-default"
                    >
                        <NewPolicyFields form={form} />
                    </fieldset>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={close}
                        disabled={form.submitting}
                        id="new-policy-cancel-btn"
                    >
                        {t('new.cancel')}
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!form.canSubmit}
                        id="create-policy-btn"
                    >
                        {form.submitting ? t('new.creating') : t('createPolicy')}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
