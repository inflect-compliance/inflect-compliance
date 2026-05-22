/**
 * Epic G-7 — Mark a single milestone complete.
 *
 *   POST /api/t/:slug/risks/:riskId/treatment-plans/:planId/milestones/:milestoneId/complete
 *   Body: { evidence?: string }
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { completeMilestone } from '@/app-layer/usecases/risk-treatment-plan';
import { CompleteMilestoneSchema } from '@/app-layer/schemas/risk-treatment-plan.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        CompleteMilestoneSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{
                    tenantSlug: string;
                    id: string;
                    planId: string;
                    milestoneId: string;
                }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await completeMilestone(
                ctx,
                params.milestoneId,
                body,
            );
            return jsonResponse(result);
        },
    ),
);
