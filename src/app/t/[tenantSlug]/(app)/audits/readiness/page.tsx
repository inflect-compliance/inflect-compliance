import { redirect } from 'next/navigation';

/**
 * `/audits/readiness` compatibility shim — audit-hub unification.
 *
 * Readiness stopped being a second, near-duplicate cycle list. The
 * cycle list at `/audits/cycles` now carries BOTH the "Open cycle"
 * and "View readiness" actions per cycle plus each cycle's readiness
 * score ring, so there is nothing left for a standalone readiness
 * overview to show. Bookmarks, the hub's "Readiness" entry, and any
 * deep links continue to resolve — they all land on the unified list.
 * Mirrors the canonical redirect pattern in `/audits/new`.
 */
export default async function ReadinessRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/audits/cycles`);
}
