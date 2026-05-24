'use client';

/**
 * Legacy `/tasks/new` route — refactored in modal-form P1 to compose the
 * shared `useNewTaskForm` hook + `<NewTaskFields>` markup. URL, chrome,
 * POST payload, secondary-link POSTs, and post-success navigation
 * preserved exactly.
 */
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Heading } from '@/components/ui/typography';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@dub/utils';
import { useNewTaskForm } from '../_form/useNewTaskForm';
import { NewTaskFields } from '../_form/NewTaskFields';

export default function NewTaskPage() {
    const tenantHref = useTenantHref();
    const { tenantSlug } = useTenantContext();
    const router = useRouter();

    const form = useNewTaskForm({
        onSuccess: (task) => router.push(tenantHref(`/tasks/${task.id}`)),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void form.submit();
    };

    return (
        <div className="max-w-2xl mx-auto space-y-section animate-fadeIn">
            <div>
                <Link
                    href={tenantHref('/tasks')}
                    className="text-content-muted text-xs hover:text-content-emphasis transition"
                >
                    ← Tasks
                </Link>
                <Heading level={1} className="mt-1" id="new-task-heading">
                    New Task
                </Heading>
                <p className="text-content-muted text-sm">
                    Create a new task to track.
                </p>
            </div>

            {form.error && (
                <div
                    role="alert"
                    className="p-3 rounded-lg border border-border-error bg-bg-error text-content-error text-sm"
                    id="task-error"
                >
                    {form.error}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className={cn(cardVariants(), 'space-y-default')}
                noValidate
            >
                <NewTaskFields form={form} tenantSlug={tenantSlug} />

                <div className="flex gap-compact pt-2">
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={form.submitting}
                        id="create-task-btn"
                    >
                        {form.submitting ? 'Creating...' : 'Create Task'}
                    </Button>
                    <Link
                        href={tenantHref('/tasks')}
                        className={buttonVariants({ variant: 'secondary' })}
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
