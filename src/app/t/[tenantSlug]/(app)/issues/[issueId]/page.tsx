import { redirect } from 'next/navigation';

/**
 * Legacy redirect: /issues/[id] → /tasks/[id].
 *
 * Server-side `redirect()` (instant 307) instead of the old client-side
 * `useEffect(router.replace)` — no client shell render, no JS round-trip, no
 * loading flash. Faster server TTFB and simpler.
 */
export default async function IssueDetailRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string; issueId: string }>;
}) {
    const { tenantSlug, issueId } = await params;
    redirect(`/t/${tenantSlug}/tasks/${issueId}`);
}
