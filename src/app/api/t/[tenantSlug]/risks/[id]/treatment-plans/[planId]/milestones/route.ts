/**
 * Epic G-7 — Add a milestone to a treatment plan.
 *
 *   POST /api/t/:slug/risks/:riskId/treatment-plans/:planId/milestones
 *   Body: { title, dueDate, description?, sortOrder?, evidence? }
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { addMilestone } from '@/app-layer/usecases/risk-treatment-plan';
import { AddMilestoneSchema } from '@/app-layer/schemas/risk-treatment-plan.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    withValidatedBody(
        AddMilestoneSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string; planId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await addMilestone(ctx, params.planId, body);
            return jsonResponse(result, { status: 201 });
        },
    ),
);
