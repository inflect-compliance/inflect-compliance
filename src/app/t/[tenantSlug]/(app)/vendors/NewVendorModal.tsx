'use client';

/**
 * NewVendorModal — modal-form P2 execution.
 */
import { type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantHref } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useNewVendorForm } from './_form/useNewVendorForm';
import { NewVendorFields } from './_form/NewVendorFields';

export interface NewVendorModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
}

export function NewVendorModal({ open, setOpen }: NewVendorModalProps) {
    const tenantHref = useTenantHref();
    const router = useRouter();

    const form = useNewVendorForm({
        onSuccess: (vendor) => {
            setOpen(false);
            router.push(tenantHref(`/vendors/${vendor.id}`));
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
            title="New vendor"
            description="Create a vendor to track third-party risk."
            preventDefaultClose={form.submitting}
        >
            <Modal.Header
                title="New vendor"
                description="Create a vendor to track third-party risk."
            />
            <Modal.Form id="new-vendor-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    {form.error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="new-vendor-error"
                            role="alert"
                        >
                            {form.error}
                        </div>
                    )}
                    <fieldset
                        disabled={form.submitting}
                        className="m-0 p-0 border-0 space-y-default"
                    >
                        <NewVendorFields form={form} />
                    </fieldset>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={close}
                        disabled={form.submitting}
                        id="new-vendor-cancel-btn"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!form.canSubmit}
                        id="create-vendor-submit"
                    >
                        {form.submitting ? 'Creating…' : 'Create Vendor'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
