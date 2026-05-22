/**
 * Epic G-7 — Treatment-plan list + create scoped to one risk.
 *
 *   GET  /api/t/:slug/risks/:riskId/treatment-plans
 *   POST /api/t/:slug/risks/:riskId/treatment-plans
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import {
    listTreatmentPlans,
    createTreatmentPlan,
} from '@/app-layer/usecases/risk-treatment-plan';
import { CreateTreatmentPlanSchema } from '@/app-layer/schemas/risk-treatment-plan.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const rows = await listTreatmentPlans(ctx, { riskId: params.id });
        return jsonResponse({ rows });
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateTreatmentPlanSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            // Body's riskId MUST match the URL — a stale or malicious
            // post can't silently re-route to a different risk.
            if (body.riskId !== params.id) {
                return jsonResponse(
                    { error: 'Body riskId must match the URL riskId.' },
                    { status: 400 },
                );
            }
            const result = await createTreatmentPlan(ctx, body);
            return jsonResponse(result, { status: 201 });
        },
    ),
);
