/**
 * Epic G-4 — Close a campaign.
 *
 *   POST /api/t/:slug/access-reviews/:reviewId/close
 *
 * Executes REVOKE/MODIFY decisions against live `TenantMembership`,
 * emits per-row audit entries, and produces the signed PDF artifact.
 * Body is empty — every input is the campaign id from the URL.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { closeAccessReview } from '@/app-layer/usecases/access-review';
import { closeConnectedAccessReview } from '@/app-layer/usecases/access-review-connected';
import { getAccessReview } from '@/app-layer/usecases/access-review';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const POST = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; reviewId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        // PR-7 — CONNECTED_APP campaigns close via the parallel connected flow
        // (remediation tasks); the mature member flow is untouched.
        const review = await getAccessReview(ctx, params.reviewId);
        const result = review?.scope === 'CONNECTED_APP'
            ? await closeConnectedAccessReview(ctx, params.reviewId)
            : await closeAccessReview(ctx, params.reviewId);
        return jsonResponse(result);
    },
);
