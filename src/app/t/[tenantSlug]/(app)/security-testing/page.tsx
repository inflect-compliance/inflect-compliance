import { getTenantCtx } from '@/app-layer/context';
import { listScannerFindings, listScannerRuns } from '@/app-layer/usecases/scanner-ingestion';
import { SecurityTestingClient, type ScannerFindingRow, type ScannerRunRow } from './SecurityTestingClient';

export const dynamic = 'force-dynamic';

/**
 * Security Testing — Server Component. Surfaces DevSecOps scanner findings
 * ingested via SARIF (the sibling of the Vulnerabilities page in the same
 * external-security-signal subsystem) and delegates filter + triage to the
 * client island.
 */
export default async function SecurityTestingPage({
    params,
}: {
    params: Promise<{ tenantSlug: string }>;
}) {
    const resolved = await params;
    const ctx = await getTenantCtx(resolved);
    const [findings, runs] = await Promise.all([
        listScannerFindings(ctx, { take: 500 }) as unknown as Promise<ScannerFindingRow[]>,
        listScannerRuns(ctx, { take: 50 }) as unknown as Promise<ScannerRunRow[]>,
    ]);

    return (
        <SecurityTestingClient
            initialFindings={findings}
            runs={runs}
            tenantSlug={resolved.tenantSlug}
        />
    );
}
