import { getTenantCtx } from '@/app-layer/context';
import { listVulnerabilities } from '@/app-layer/usecases/vulnerability';
import { VulnerabilitiesClient, type VulnRow } from './VulnerabilitiesClient';

export const dynamic = 'force-dynamic';

/**
 * Vulnerabilities — Server Component. Fetches matched CVEs across the tenant's
 * assets and delegates interaction (filter + convert) to the client island.
 */
export default async function VulnerabilitiesPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const rows = (await listVulnerabilities(ctx, { take: 500 })) as unknown as VulnRow[];

    return (
        <VulnerabilitiesClient
            initialRows={rows}
            tenantSlug={resolved.tenantSlug}
            canWrite={ctx.permissions.canWrite}
        />
    );
}
