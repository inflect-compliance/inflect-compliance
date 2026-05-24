'use client';

/**
 * NewTaskModal — modal-form P2 execution.
 *
 * Mounts the P1-extracted `useNewTaskForm` hook + `<NewTaskFields>`
 * markup inside `<Modal>`. The hook owns the pending-links staging
 * buffer + the per-type validation (`AUDIT_FINDING` / `CONTROL_GAP`
 * requires a control or link); the modal just chrome's it.
 *
 * The legacy `/tasks/new` route is now a redirect → `/tasks?create=1`;
 * the list page (TasksClient) auto-opens this modal.
 */
import { type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { useNewTaskForm } from './_form/useNewTaskForm';
import { NewTaskFields } from './_form/NewTaskFields';

export interface NewTaskModalProps {
    open: boolean;
    setOpen: Dispatch<SetStateAction<boolean>>;
}

export function NewTaskModal({ open, setOpen }: NewTaskModalProps) {
    const tenantHref = useTenantHref();
    const { tenantSlug } = useTenantContext();
    const router = useRouter();

    const form = useNewTaskForm({
        onSuccess: (task) => {
            setOpen(false);
            router.push(tenantHref(`/tasks/${task.id}`));
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
            title="New task"
            description="Create a new task to track."
            preventDefaultClose={form.submitting}
        >
            <Modal.Header
                title="New task"
                description="Create a new task to track."
            />
            <Modal.Form id="new-task-form" onSubmit={handleSubmit}>
                <Modal.Body>
                    {form.error && (
                        <div
                            className="mb-4 rounded-lg border border-border-error bg-bg-error px-3 py-2 text-sm text-content-error"
                            id="new-task-error"
                            role="alert"
                        >
                            {form.error}
                        </div>
                    )}
                    <fieldset
                        disabled={form.submitting}
                        className="m-0 p-0 border-0 space-y-default"
                    >
                        <NewTaskFields form={form} tenantSlug={tenantSlug} />
                    </fieldset>
                </Modal.Body>
                <Modal.Actions>
                    <Button
                        variant="secondary"
                        size="sm"
                        onClick={close}
                        disabled={form.submitting}
                        id="new-task-cancel-btn"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="submit"
                        variant="primary"
                        size="sm"
                        disabled={!form.canSubmit}
                        id="create-task-btn"
                    >
                        {form.submitting ? 'Creating…' : 'Create Task'}
                    </Button>
                </Modal.Actions>
            </Modal.Form>
        </Modal>
    );
}
