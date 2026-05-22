/**
 * Epic G-7 — Change a treatment plan's strategy.
 *
 *   POST /api/t/:slug/risks/:riskId/treatment-plans/:planId/strategy
 *   Body: { strategy: TreatmentStrategy, reason: string }
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { changeStrategy } from '@/app-layer/usecases/risk-treatment-plan';
import { ChangeStrategySchema } from '@/app-layer/schemas/risk-treatment-plan.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        ChangeStrategySchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string; planId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await changeStrategy(ctx, params.planId, body);
            return jsonResponse(result);
        },
    ),
);
