import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { listAgentProposals } from '@/app-layer/usecases/agent-proposals';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * GET /api/t/:tenantSlug/agent-proposals — the human review queue backing the
 * agent-proposals page. Lists proposals (optionally filtered by `?status=`).
 * Read-gated by the usecase (`assertCanRead`), tenant-scoped by RLS.
 */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const status = req.nextUrl.searchParams.get('status') ?? undefined;
    const proposals = await listAgentProposals(ctx, { status: status ?? undefined });
    return jsonResponse(proposals);
});
