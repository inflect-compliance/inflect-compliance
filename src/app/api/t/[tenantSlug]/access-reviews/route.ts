/**
 * Epic G-4 — Access Review campaign list + create.
 *
 *   GET  /api/t/:slug/access-reviews         → CappedList<AccessReviewSummary>
 *   POST /api/t/:slug/access-reviews         → { accessReviewId, snapshotCount }
 *
 * Both surfaces delegate to `src/app-layer/usecases/access-review.ts`
 * — every authorisation, sanitisation, and snapshot rule lives there.
 * The route is a thin HTTP boundary.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import {
    listAccessReviews,
    createAccessReview,
} from '@/app-layer/usecases/access-review';
import { CreateAccessReviewSchema } from '@/app-layer/schemas/access-review.schemas';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import {
    LIST_BACKFILL_CAP,
    applyBackfillCap,
} from '@/lib/list-backfill-cap';
import { recordListPageRowCount } from '@/lib/observability/list-page-metrics';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const reviews = await listAccessReviews(ctx, {
            take: LIST_BACKFILL_CAP + 1,
        });
        const result = applyBackfillCap(reviews);
        recordListPageRowCount({
            entity: 'access-reviews',
            count: result.rows.length,
            truncated: result.truncated,
            tenantId: ctx.tenantId,
        });
        return jsonResponse(result);
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateAccessReviewSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await createAccessReview(ctx, body);
            return jsonResponse(result, { status: 201 });
        },
    ),
);
