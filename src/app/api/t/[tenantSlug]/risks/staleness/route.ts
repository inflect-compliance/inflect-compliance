/**
 * GET /api/t/[tenantSlug]/risks/staleness
 *
 * RQ2-8 — assessment-staleness report. Read-only; auth via
 * `assertCanRead` inside the usecase — same gate as the risk
 * dashboard.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getRiskStaleness } from '@/app-layer/usecases/risk-staleness';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const report = await getRiskStaleness(ctx);
        return jsonResponse(report);
    },
);
