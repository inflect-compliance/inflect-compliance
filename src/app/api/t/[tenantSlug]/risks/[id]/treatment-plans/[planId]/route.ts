/**
 * Epic G-7 — Treatment-plan detail under the risk scope.
 *
 *   GET /api/t/:slug/risks/:riskId/treatment-plans/:planId
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTreatmentPlan } from '@/app-layer/usecases/risk-treatment-plan';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { notFound } from '@/lib/errors/types';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string; planId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const plan = await getTreatmentPlan(ctx, params.planId);
        if (plan.riskId !== params.id) {
            throw notFound('Treatment plan not found');
        }
        return jsonResponse(plan);
    },
);
