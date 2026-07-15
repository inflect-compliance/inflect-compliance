import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listMapsUsingAsset } from '@/app-layer/usecases/process-map';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * PR-D — reverse lookup. "Where is this asset used?" Read-only; returns one
 * row per (process map, node) pairing where an `asset` node links this Asset.
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
        const maps = await listMapsUsingAsset(ctx, params.id);
        return jsonResponse({ maps });
    },
);
