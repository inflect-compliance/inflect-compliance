/**
 * GET /api/t/[tenantSlug]/risks/tail-percentiles
 *
 * RQ3-4 — the per-risk tail-percentile cache from the latest
 * completed simulation run (RQ3-1's data spine), keyed by riskId.
 * Powers the tail-aware ALE register ("expected … · bad year …")
 * on the risk register and detail surfaces. `snapshot` is null
 * when no simulation has completed — consumers degrade to the
 * mean register.
 *
 * Auth: `assertCanRead` inside the usecase — same gate as the
 * risk dashboard.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getPerRiskPercentiles } from '@/app-layer/usecases/monte-carlo';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        {
            params: paramsPromise,
        }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const snapshot = await getPerRiskPercentiles(ctx);
        return jsonResponse({ snapshot });
    },
);
