import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getScoreExplanation } from '@/app-layer/usecases/risk-score-explanation';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * RQ2-3 — aggregated "why this number" payload for the
 * RiskScoreExplainer popover. Read-only; one round trip.
 */
export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const explanation = await getScoreExplanation(ctx, params.id);
    return jsonResponse(explanation);
});
