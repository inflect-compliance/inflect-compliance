import { getTenantCtx } from '@/app-layer/context';
import { coverageSummary } from '@/app-layer/usecases/traceability';
import { CoverageClient } from './CoverageClient';

export const dynamic = 'force-dynamic';

/**
 * Coverage Dashboard — Server Component.
 *
 * Fetches the coverage summary server-side and passes it to the client
 * island for interactive rendering. Accessible from Assets → Coverage.
 */
export default async function CoveragePage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });
    const data = await coverageSummary(ctx);

    return (
        <div className="space-y-section animate-fadeIn">
            <CoverageClient
                data={JSON.parse(JSON.stringify(data))}
                tenantSlug={tenantSlug}
            />
        </div>
    );
}
