import { getTenantCtx } from '@/app-layer/context';
import {
    listInstalledFrameworks,
    resolveInstalledFrameworkKey,
} from '@/app-layer/usecases/soa';
import { generateReadinessReport } from '@/app-layer/usecases/framework/coverage';
import { ReportsClient } from './ReportsClient';

export const dynamic = 'force-dynamic';

/**
 * Reports — framework-agnostic report catalog (PR-G).
 *
 * The landing is a catalog of report types scoped by a framework selector, not
 * a SoA table. It computes the tenant's installed frameworks + the resolved
 * default's Coverage/Readiness report server-side; the client re-fetches
 * readiness when the selector changes. SoA (an ISO-Annex-A artifact) now lives
 * at /reports/soa and appears in the catalog only for ISO-family frameworks —
 * so this page no longer computes it (no more getSoA / getReports double-work).
 */
export default async function ReportsPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    const ctx = await getTenantCtx({ tenantSlug });

    const [installedFrameworks, defaultFrameworkKey] = await Promise.all([
        listInstalledFrameworks(ctx),
        resolveInstalledFrameworkKey(ctx),
    ]);
    const initialReadiness = await generateReadinessReport(ctx, defaultFrameworkKey);

    return (
        <div className="space-y-section animate-fadeIn">
            <ReportsClient
                installedFrameworks={JSON.parse(JSON.stringify(installedFrameworks))}
                defaultFrameworkKey={defaultFrameworkKey}
                initialReadiness={JSON.parse(JSON.stringify(initialReadiness))}
                tenantSlug={tenantSlug}
                canEdit={ctx.permissions.canWrite}
            />
        </div>
    );
}
