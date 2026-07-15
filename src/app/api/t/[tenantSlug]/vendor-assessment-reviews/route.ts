/**
 * GET /api/t/[tenantSlug]/vendor-assessment-reviews
 *
 * Returns the tenant's vendor-assessment review queue — G-3
 * assessments in the SUBMITTED / REVIEWED / CLOSED set, ordered
 * SUBMITTED-first. Backs the reviewer index page.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listReviewableAssessments } from '@/app-layer/usecases/vendor-assessment-review';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const rows = await listReviewableAssessments(ctx);
        return jsonResponse(rows);
    },
);
