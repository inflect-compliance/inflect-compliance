'use client';

/**
 * Legacy `/vendors/new` route — refactored in modal-form P1 to compose
 * the shared `useNewVendorForm` hook + `<NewVendorFields>` markup. URL,
 * chrome, POST payload, and post-success navigation preserved exactly.
 */
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTenantHref } from '@/lib/tenant-context-provider';
import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { Heading } from '@/components/ui/typography';
import { cardVariants } from '@/components/ui/card';
import { cn } from '@dub/utils';
import { useNewVendorForm } from '../_form/useNewVendorForm';
import { NewVendorFields } from '../_form/NewVendorFields';

export default function CreateVendorPage() {
    const tenantHref = useTenantHref();
    const router = useRouter();

    const form = useNewVendorForm({
        onSuccess: (vendor) => router.push(tenantHref(`/vendors/${vendor.id}`)),
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        void form.submit();
    };

    return (
        <div className="max-w-2xl mx-auto space-y-section">
            <div className="flex items-center gap-compact">
                <Link
                    href={tenantHref('/vendors')}
                    className="text-content-muted hover:text-content-emphasis"
                >
                    ← Back
                </Link>
                <Heading level={1}>New Vendor</Heading>
            </div>

            {form.error && (
                <div
                    role="alert"
                    className="rounded border border-border-error bg-bg-error text-content-error p-3"
                    id="create-vendor-error"
                >
                    {form.error}
                </div>
            )}

            <form
                onSubmit={handleSubmit}
                className={cn(cardVariants(), 'space-y-default')}
                noValidate
            >
                <NewVendorFields form={form} />

                <div className="flex gap-compact pt-2">
                    <Button
                        type="submit"
                        variant="primary"
                        disabled={!form.canSubmit}
                        id="create-vendor-submit"
                    >
                        {form.submitting ? 'Creating…' : 'Create Vendor'}
                    </Button>
                    <Link
                        href={tenantHref('/vendors')}
                        className={buttonVariants({ variant: 'secondary' })}
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
