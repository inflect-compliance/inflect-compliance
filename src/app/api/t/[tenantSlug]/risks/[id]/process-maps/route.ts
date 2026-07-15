import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listMapsUsingRisk } from '@/app-layer/usecases/process-map';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * PR-D — reverse lookup. "Where is this risk used?" Read-only; returns one
 * row per (process map, node) pairing where a `risk` node links this Risk.
 */
export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        {
            params: paramsPromise,
        }: {
            params: Promise<{ tenantSlug: string; id: string }>;
        },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const maps = await listMapsUsingRisk(ctx, params.id);
        return jsonResponse({ maps });
    },
);
