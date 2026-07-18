import { redirect } from 'next/navigation';

/**
 * `/policies/templates` compatibility shim.
 *
 * The standalone template-gallery page was retired: template-driven
 * policy creation (including the framework-aware control-suggestion
 * step) now lives entirely in the canonical `NewPolicyModal`, opened
 * from the policies list via `?create=1&template=1`. This route stays
 * so bookmarks and deep links keep working — they land on the list
 * with the modal auto-opened in template-picker mode.
 */
export default async function PolicyTemplatesRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/policies?create=1&template=1`);
}
