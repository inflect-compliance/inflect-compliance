import { getTenantCtx } from '@/app-layer/context';
import { listIncidents } from '@/app-layer/usecases/incident';
import { IncidentsClient } from './IncidentsClient';

export const dynamic = 'force-dynamic';

/**
 * Incidents — Server Component (NIS2 Article 23 incident response).
 * Fetches the bounded per-tenant incident list server-side and
 * delegates all interaction to the client island.
 */
export default async function IncidentsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const incidents = await listIncidents(ctx);

    return (
        <IncidentsClient
            initialIncidents={JSON.parse(JSON.stringify(incidents))}
            tenantSlug={tenantSlug}
            canManage={ctx.appPermissions.incidents.manage}
        />
    );
}
