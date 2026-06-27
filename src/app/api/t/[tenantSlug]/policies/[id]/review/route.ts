import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { markPolicyReviewed } from '@/app-layer/usecases/policy';
import { jsonResponse } from '@/lib/api-response';

// POST /api/t/[tenantSlug]/policies/[id]/review — mark a policy reviewed
// (periodic re-validation): stamps lastReviewedAt + recomputes nextReviewAt.
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await markPolicyReviewed(ctx, params.id);
    return jsonResponse(result);
});
