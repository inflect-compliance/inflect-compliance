import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { createConnectedAccessReview } from '@/app-layer/usecases/access-review-connected';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** PR-7 — launch a CONNECTED_APP access review over connected identity accounts. */
export const POST = withApiErrorHandling(
    async (req: NextRequest, { params: p }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await p;
        const ctx = await getTenantCtx(params, req);
        const body = await req.json().catch(() => ({}));
        const result = await createConnectedAccessReview(ctx, body);
        return jsonResponse(result, { status: 201 });
    },
);
