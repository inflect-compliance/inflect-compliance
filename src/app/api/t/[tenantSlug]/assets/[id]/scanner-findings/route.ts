import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAssetScannerFindings } from '@/app-layer/usecases/scanner-ingestion';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** Scanner findings resolved to this asset — the detail vuln tab renders them
 *  alongside the asset's CVE-matched vulnerabilities. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const rows = await listAssetScannerFindings(ctx, params.id);
        return jsonResponse({ rows });
    },
);
