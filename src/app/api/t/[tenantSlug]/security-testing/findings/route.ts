import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listScannerFindings } from '@/app-layer/usecases/scanner-ingestion';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET /api/t/:slug/security-testing/findings — scanner findings (filterable). */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const sp = req.nextUrl.searchParams;
        const rows = await listScannerFindings(ctx, {
            status: sp.get('status') ?? undefined,
            severity: sp.get('severity') ?? undefined,
        });
        return jsonResponse({ rows });
    },
);
