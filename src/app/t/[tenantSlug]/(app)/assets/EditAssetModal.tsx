'use client';

/**
 * EditAssetModal — modal-form P2 execution.
 *
 * Unlike the three create modals (which the list page opens via
 * `?create=1`), the asset edit modal mounts from the asset DETAIL
 * page header. The detail page URL stays canonical; the modal is a
 * pure overlay launched from the "Edit" button.
 *
 * Composes the P1-extracted `useEditAssetForm` hook + `<EditAssetFields>`
 * markup. The hook seeds from the loaded asset row and PATCHes back;
 * on success the modal closes and the parent's `onSaved` callback
 * applies the updated row to the detail-page state.
 */
import { type Dispatch, type SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import {
    useEditAssetForm,
    type EditAssetFormFields,
} from './_form/useEditAssetForm';
import { EditAssetFields } from './_form/EditAssetFields';

export interface EditAssetModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
    assetId: string;
    initial: Partial<EditAssetFormFields>;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onSaved: (updated: any) => void;
}

export function EditAssetModal({
    open,
    setOpen,
    assetId,
    initial,
    onSaved,
}: EditAssetModalProps) {
    const form = useEditAssetForm({
        assetId,
        initial,
        onSuccess: (updated) => {
            setOpen(false);
            onSaved(updated);
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
            title="Edit asset"
            description="Update the asset's metadata."
            preventDefaultClose={form.submitting}
        >
            <Modal.Header
                title="Edit asset"
                description="Update the asset's metadata."
            />
            <Modal.Form id="edit-asset-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    {form.error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="edit-asset-error"
                            role="alert"
                        >
                            {form.error}
                        </div>
                    )}
                    <fieldset
                        disabled={form.submitting}
                        className="m-0 p-0 border-0 space-y-default"
                    >
                        <EditAssetFields form={form} />
                    </fieldset>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={close}
                        disabled={form.submitting}
                        id="edit-asset-cancel-btn"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!form.canSubmit}
                        id="save-asset-btn"
                    >
                        {form.submitting ? 'Saving…' : 'Save'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
