import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { approveAgentProposal } from '@/app-layer/usecases/agent-proposals';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/:tenantSlug/agent-proposals/:id/approve — the human-in-the-loop
 * gate. Approving runs the REAL create-usecase (audited as the reviewer, with
 * the proposing agent's key in metadata). Write-gated by the usecase
 * (`assertCanWrite`). Optional `{ edits: {...} }` body merges edits before
 * creation.
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    let edits: Record<string, unknown> | undefined;
    try {
        const body = (await req.json()) as { edits?: Record<string, unknown> } | null;
        edits = body?.edits;
    } catch {
        // No/invalid body → approve as-proposed.
    }
    const result = await approveAgentProposal(ctx, params.id, edits);
    return jsonResponse(result);
});
