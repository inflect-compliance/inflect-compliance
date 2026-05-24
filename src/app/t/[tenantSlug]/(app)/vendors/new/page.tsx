import { redirect } from 'next/navigation';

/**
 * `/vendors/new` compatibility shim — modal-form P2.
 *
 * Vendor creation moved from a full-page form into a modal mounted on
 * the vendors list (`src/.../vendors/NewVendorModal.tsx`). Bookmarks,
 * deep links, and E2E `page.goto('/vendors/new')` continue to work —
 * they all land on `/vendors?create=1`, which VendorsClient detects.
 */
export default async function NewVendorRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/vendors?create=1`);
}
