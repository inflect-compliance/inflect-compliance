import { redirect } from 'next/navigation';

/**
 * `/audits/new` compatibility shim — modal-form follow-up.
 *
 * Audit creation moved from an inline list-page form into a modal
 * mounted on the audits list (`src/.../audits/NewAuditModal.tsx`).
 * Bookmarks, deep links, and E2E `page.goto('/audits/new')` continue
 * to work — they all land on `/audits?create=1`, which AuditsClient
 * detects and opens the modal for. Mirrors the canonical pattern
 * established by `/vendors/new` (modal-form P2).
 */
export default async function NewAuditRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/audits?create=1`);
}
