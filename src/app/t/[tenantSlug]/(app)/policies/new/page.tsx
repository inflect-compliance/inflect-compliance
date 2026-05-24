'use client';

/**
 * Legacy `/policies/new` route — refactored in modal-form P1 to compose
 * the shared `useNewPolicyForm` hook + `<NewPolicyFields>` markup. The
 * URL, the visible chrome, the POST payload, and the post-success
 * navigation are all unchanged; this is purely a decomposition so the
 * P2 `<NewPolicyModal>` can mount the same form against the modal shell.
 *
 * See `docs/implementation-notes/2026-05-24-modal-form-architecture.md`.
 */
import { useRouter, useSearchParams } from 'next/navigation';
import { useTenantHref, useTenantContext } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { Heading } from '@/components/ui/typography';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@dub/utils';
import { useNewPolicyForm } from '../_form/useNewPolicyForm';
import { NewPolicyFields } from '../_form/NewPolicyFields';

export default function NewPolicyPage() {
    const tenantHref = useTenantHref();
    const router = useRouter();
    const searchParams = useSearchParams();
    const tenant = useTenantContext();

    const isTemplateMode = searchParams?.get('template') === '1';

    const form = useNewPolicyForm({
        isTemplateMode,
        onSuccess: (policy) =>
            router.push(tenantHref(`/policies/${policy.id}`)),
    });

    if (!tenant.permissions.canWrite) {
        return (
            <div
                className={cn(
                    cardVariants({ density: 'spacious' }),
                    'text-center text-content-subtle animate-fadeIn',
                )}
            >
                <p className="text-lg mb-2">Permission Denied</p>
                <p className="text-sm">
                    You do not have permission to create policies.
                </p>
            </div>
        );
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void form.submit();
    };

    return (
        <div className="max-w-3xl mx-auto space-y-section animate-fadeIn">
            <div>
                <Heading level={1}>
                    {isTemplateMode ? 'New Policy from Template' : 'New Policy'}
                </Heading>
                <p className="text-content-muted text-sm mt-1">
                    {isTemplateMode
                        ? 'Select a template to start with pre-written content.'
                        : 'Create a blank policy and add content later.'}
                </p>
            </div>

            {form.error && (
                <div
                    role="alert"
                    className="p-3 rounded-lg border border-border-error bg-bg-error text-content-error text-sm"
                    id="new-policy-error"
                >
                    {form.error}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className={cn(cardVariants(), 'space-y-default')}
                noValidate
            >
                <NewPolicyFields form={form} />

                <div className="flex gap-tight pt-2">
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={!form.canSubmit}
                        id="create-policy-btn"
                    >
                        {form.submitting ? 'Creating...' : 'Create Policy'}
                    </Button>
                    <Button
                        type="button"
                        variant="secondary"
                        onClick={() => router.back()}
                    >
                        Cancel
                    </Button>
                </div>
            </form>
        </div>
    );
}
