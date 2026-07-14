import { redirect } from 'next/navigation';

/**
 * `/tasks/dashboard` compatibility shim — TP-7 (Tasks roadmap).
 *
 * The standalone Tasks dashboard was MERGED into the `/tasks` list:
 *   - the KPI strip on the list is now server-computed
 *     (`getTaskMetrics`), so it can't diverge from what the dashboard
 *     showed, and
 *   - the dashboard's "My Tasks" section is the list's "Assigned to
 *     me" toggle (TP-6).
 *
 * The page is retired to a redirect so bookmarks, deep links, the
 * legacy `/issues/dashboard` redirect, and E2E `page.goto` all keep
 * working — they land on the unified `/tasks` list. Mirrors the
 * canonical redirect-shim pattern (`/audits/new`, `/tasks/new`).
 */
export default async function TasksDashboardRedirect({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    redirect(`/t/${tenantSlug}/tasks`);
}
