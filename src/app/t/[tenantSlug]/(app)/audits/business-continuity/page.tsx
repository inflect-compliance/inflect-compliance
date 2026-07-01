import { getTenantCtx } from '@/app-layer/context';
import { listBias } from '@/app-layer/usecases/business-impact-analysis';
import { BusinessContinuityClient, type BiaRow } from './BusinessContinuityClient';

export const dynamic = 'force-dynamic';

/**
 * Business Continuity (BIA register) — Server Component. Sits under the
 * Internal Audit area beside Incidents. Lists Business Impact Analyses with
 * their derived recovery-priority rank and delegates filter + create to the
 * client island.
 */
export default async function BusinessContinuityPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const rows = (await listBias(ctx)) as unknown as BiaRow[];

    return (
        <BusinessContinuityClient
            initialRows={rows}
            tenantSlug={resolved.tenantSlug}
            canWrite={ctx.permissions.canWrite}
        />
    );
}
