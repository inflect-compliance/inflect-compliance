import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { rollbackPolicy } from '@/app-layer/usecases/policy';
import { jsonResponse } from '@/lib/api-response';

// POST /api/t/[tenantSlug]/policies/[id]/rollback — re-publish the previous
// published version (Prompt-3.1). Admin-gated in the usecase.
export const POST = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const policy = await rollbackPolicy(ctx, params.id);
        return jsonResponse(policy);
    },
);
