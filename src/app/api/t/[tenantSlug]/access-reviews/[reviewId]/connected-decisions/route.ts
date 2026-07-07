import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listConnectedDecisions } from '@/app-layer/usecases/access-review-connected';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** PR-7 — list connected-account decisions for a CONNECTED_APP review. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: p }: { params: Promise<{ tenantSlug: string; reviewId: string }> }) => {
        const params = await p;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ decisions: await listConnectedDecisions(ctx, params.reviewId) });
    },
);
