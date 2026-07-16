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
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
    const resolved = await params;
    const sp = await searchParams;
    const ctx = await getTenantCtx(resolved);
    // Deep-link support: the per-asset vuln badge on the assets list links here
    // with ?assetId=<id>, scoping the global view to that asset's vulnerabilities.
    const assetId = typeof sp.assetId === 'string' && sp.assetId ? sp.assetId : undefined;
    const rows = (await listVulnerabilities(ctx, { assetId, take: 500 })) as unknown as VulnRow[];

    return (
        <VulnerabilitiesClient
            initialRows={rows}
            tenantSlug={resolved.tenantSlug}
            canWrite={ctx.permissions.canWrite}
        />
    );
}
