import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { rejectAgentProposal } from '@/app-layer/usecases/agent-proposals';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/:tenantSlug/agent-proposals/:id/reject — reject a pending
 * proposal. Nothing is created. Write-gated by the usecase (`assertCanWrite`).
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    await rejectAgentProposal(ctx, params.id);
    return jsonResponse({ ok: true });
});
