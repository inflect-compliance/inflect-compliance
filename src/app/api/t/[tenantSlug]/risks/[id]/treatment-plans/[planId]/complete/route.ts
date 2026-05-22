/**
 * Epic G-7 — Close a treatment plan with a required closing remark.
 *
 *   POST /api/t/:slug/risks/:riskId/treatment-plans/:planId/complete
 *   Body: { closingRemark: string }
 *
 * Side effect: transitions the linked Risk per the strategy → status
 * mapping in the usecase. Audit log emits both the plan-completion
 * row and the risk-status-change row.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { completePlan } from '@/app-layer/usecases/risk-treatment-plan';
import { CompletePlanSchema } from '@/app-layer/schemas/risk-treatment-plan.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        CompletePlanSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string; planId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await completePlan(ctx, params.planId, body);
            return jsonResponse(result);
        },
    ),
);
