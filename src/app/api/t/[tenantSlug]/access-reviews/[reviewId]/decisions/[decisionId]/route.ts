/**
 * Epic G-4 — Submit a per-user reviewer verdict.
 *
 *   PUT /api/t/:slug/access-reviews/:reviewId/decisions/:decisionId
 *
 * Body: discriminated union on `decision`
 *   { decision: 'CONFIRM', notes?: string }
 *   { decision: 'REVOKE',  notes?: string }
 *   { decision: 'MODIFY',  modifiedToRole: Role,
 *                          modifiedToCustomRoleId?: string,
 *                          notes?: string }
 *
 * The reviewer-vs-admin gate, the CHECK-pair shape, and the
 * OPEN→IN_REVIEW transition all live in the usecase.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { submitDecision } from '@/app-layer/usecases/access-review';
import { SubmitDecisionSchema } from '@/app-layer/schemas/access-review.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const PUT = withApiErrorHandling(
    withValidatedBody(
        SubmitDecisionSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{
                    tenantSlug: string;
                    reviewId: string;
                    decisionId: string;
                }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await submitDecision(
                ctx,
                params.decisionId,
                body,
            );
            return jsonResponse(result);
        },
    ),
);
