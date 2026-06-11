/**
 * GET /api/t/[tenantSlug]/risks/coherence
 *
 * RQ2-5 — qual ↔ quant coherence report. Returns the
 * `CoherenceReport` (rank-disagreement flags + quantified counts).
 * Read-only; auth via `assertCanRead` inside the usecase — same
 * gate as the risk dashboard.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getRiskCoherence } from '@/app-layer/usecases/risk-analytics';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const report = await getRiskCoherence(ctx);
        return jsonResponse(report);
    },
);
