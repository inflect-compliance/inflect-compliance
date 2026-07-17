import { ReadinessOverviewClient } from './ReadinessOverviewClient';

export const dynamic = 'force-dynamic';

/**
 * `/audits/readiness` — the single readiness overview (readiness-reconcile).
 *
 * Previously a redirect shim to `/audits/cycles`. It is now the one surface
 * that presents all three readiness axes together — control coverage (per
 * cycle), NIS2 self-assessment maturity, and test readiness — each
 * unambiguously labelled, instead of surfacing only `computeReadiness`.
 * No navbar change: the hub's existing "Readiness" entry lands here.
 */
export default async function ReadinessOverviewPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const { tenantSlug } = await params;
    return (
        <div className="animate-fadeIn">
            <ReadinessOverviewClient tenantSlug={tenantSlug} />
        </div>
    );
}
