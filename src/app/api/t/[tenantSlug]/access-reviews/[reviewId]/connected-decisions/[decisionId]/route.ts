import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { submitConnectedDecision } from '@/app-layer/usecases/access-review-connected';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** PR-7 — record a verdict on a connected-account decision. */
export const POST = withApiErrorHandling(
    async (req: NextRequest, { params: p }: { params: Promise<{ tenantSlug: string; reviewId: string; decisionId: string }> }) => {
        const params = await p;
        const ctx = await getTenantCtx(params, req);
        const body = await req.json().catch(() => ({}));
        return jsonResponse(await submitConnectedDecision(ctx, params.decisionId, body));
    },
);
