import { redirect } from 'next/navigation';

/**
 * `/assets/new` compatibility shim — modal-form follow-up.
 *
 * Asset creation moved from an inline list-page form into a modal
 * mounted on the assets list (`src/.../assets/NewAssetModal.tsx`).
 * Bookmarks, deep links, and E2E `page.goto('/assets/new')` continue
 * to work — they all land on `/assets?create=1`, which AssetsClient
 * detects and opens the modal for. Mirrors the canonical pattern
 * established by `/vendors/new` (modal-form P2).
 */
export default async function NewAssetRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/assets?create=1`);
}
