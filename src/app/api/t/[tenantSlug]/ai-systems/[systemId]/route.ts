import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { getAiSystem } from '@/app-layer/usecases/ai-system';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * GET /api/t/:tenantSlug/ai-systems/:systemId — a single registered AI system
 * with its linked AI-Act / ISO 42001 obligations.
 */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string; systemId: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx({ tenantSlug: params.tenantSlug }, req);
    const system = await getAiSystem(ctx, params.systemId);
    return jsonResponse(system);
});
