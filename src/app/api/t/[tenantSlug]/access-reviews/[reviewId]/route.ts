/**
 * Epic G-4 — Access Review detail.
 *
 *   GET /api/t/:slug/access-reviews/:reviewId
 *     → campaign + every decision row + reviewer/creator/closer +
 *       per-decision subject user + joined live membership.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getAccessReviewWithActivity } from '@/app-layer/usecases/access-review';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; reviewId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const review = await getAccessReviewWithActivity(
            ctx,
            params.reviewId,
        );
        return jsonResponse(review);
    },
);
