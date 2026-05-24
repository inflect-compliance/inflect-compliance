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
import { type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantHref } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
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

    const form = useNewPolicyForm({
        isTemplateMode,
        onSuccess: (policy) => {
            setOpen(false);
            router.push(tenantHref(`/policies/${policy.id}`));
        },
    });

    const close = () => {
        if (form.submitting) return;
        setOpen(false);
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void form.submit();
    };

    return (
        <Modal
            showModal={open}
            setShowModal={setOpen}
            size="lg"
            title={isTemplateMode ? 'New policy from template' : 'New policy'}
            description={
                isTemplateMode
                    ? 'Select a template to start with pre-written content.'
                    : 'Create a blank policy and add content later.'
            }
            preventDefaultClose={form.submitting}
        >
            <Modal.Header
                title={isTemplateMode ? 'New policy from template' : 'New policy'}
                description={
                    isTemplateMode
                        ? 'Select a template to start with pre-written content.'
                        : 'Create a blank policy and add content later.'
                }
            />
            <Modal.Form id="new-policy-form" onSubmit={handleSubmit}>
                <Modal.Body>
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
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!form.canSubmit}
                        id="create-policy-btn"
                    >
                        {form.submitting ? 'Creating…' : 'Create Policy'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
