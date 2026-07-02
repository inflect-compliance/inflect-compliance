import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getLatestPostureSummary, toPostureDto } from '@/app-layer/usecases/compliance-posture';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * GET /api/t/:tenantSlug/dashboard/posture-summary
 *
 * Returns the cached AI compliance-posture summary for the tenant (or null
 * when the daily cron has not yet produced one). Cheap read — never invokes
 * an LLM on the request path.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const summary = await getLatestPostureSummary(ctx);
        return jsonResponse(toPostureDto(summary));
    },
);
