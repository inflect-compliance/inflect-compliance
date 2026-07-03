import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { generateConformityDraft } from '@/app-layer/usecases/ai-system-conformity';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/:tenantSlug/ai-systems/:systemId/conformity — generate a DRAFT
 * conformity artifact (Annex IV / Art 9 / Annex V) for a HIGH-risk system and
 * queue it for human approval (propose-not-commit). Never auto-publishes.
 */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; systemId: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx({ tenantSlug: params.tenantSlug }, req);
    const body = await req.json();
    const result = await generateConformityDraft(ctx, params.systemId, body);
    return jsonResponse(result, { status: 202 });
});
