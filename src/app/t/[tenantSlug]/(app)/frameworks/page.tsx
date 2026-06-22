import { getTenantCtx } from '@/app-layer/context';
import { listFrameworks, computeCoverage } from '@/app-layer/usecases/framework';

import { FrameworksClient } from './FrameworksClient';

export const dynamic = 'force-dynamic';

export default async function FrameworksPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const frameworks = await listFrameworks(ctx);

    // Fetch coverage for each framework in parallel.
    const coverages: Record<string, Awaited<ReturnType<typeof computeCoverage>>> = {};
    await Promise.all(
        frameworks.map(async (fw) => {
            try {
                coverages[fw.key] = await computeCoverage(ctx, fw.key);
            } catch {
                /* framework may not have requirements */
            }
        }),
    );

    return (
        <FrameworksClient
            frameworks={frameworks}
            coverages={coverages}
            tenantSlug={tenantSlug}
        />
    );
}
