import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listMapsUsingControl } from '@/app-layer/usecases/process-map';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * Epic P2-PR-C — reverse lookup. "Where is this control used?"
 * Read-only; no rate-limit override beyond the default. Returns
 * one row per (process map, edge) pairing — usually one edge per
 * map but the schema permits multiple.
 */
export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        {
            params: paramsPromise,
        }: {
            params: Promise<{ tenantSlug: string; controlId: string }>;
        },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const maps = await listMapsUsingControl(ctx, params.controlId);
        return jsonResponse({ maps });
    },
);
