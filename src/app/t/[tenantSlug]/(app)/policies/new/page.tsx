import { redirect } from 'next/navigation';

/**
 * `/policies/new` compatibility shim — modal-form P2.
 *
 * Policy creation moved from a full-page form into a modal mounted on
 * the policies list (`src/.../policies/NewPolicyModal.tsx`). This
 * route still exists so bookmarks, deep links, and E2E tests that
 * `page.goto('/policies/new')` continue to work — they all land on
 * `/policies?create=1`, which PoliciesClient detects on mount and
 * opens the modal automatically. The flag is then stripped from the
 * URL so subsequent back/forward doesn't re-open the modal.
 *
 * Mirrors `/risks/new` (Epic 54) — same redirect-shim pattern.
 */
export default async function NewPolicyRedirect({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams?: Promise<{ template?: string }>;
}) {
    const { tenantSlug } = await params;
    const sp = (await searchParams) ?? {};
    // Preserve the `?template=1` flag through the redirect so the
    // modal opens in template-picker mode when arriving from a "New
    // policy from template" deep link.
    const query = sp.template === '1' ? 'create=1&template=1' : 'create=1';
    redirect(`/t/${tenantSlug}/policies?${query}`);
}
