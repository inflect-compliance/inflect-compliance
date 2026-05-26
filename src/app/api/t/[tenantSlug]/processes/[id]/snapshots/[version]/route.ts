import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getProcessMapSnapshot } from '@/app-layer/usecases/process-map';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';

/**
 * Epic P5-PR-B — fetch one snapshot's full graphJson by version.
 * Read-only; surfaces "View version N" overlay + visual diff
 * computation. The 200 response carries `{ id, version,
 * graphJson, createdAt, createdByName }`.
 */
export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        {
            params: paramsPromise,
        }: {
            params: Promise<{
                tenantSlug: string;
                id: string;
                version: string;
            }>;
        },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const v = Number.parseInt(params.version, 10);
        if (!Number.isFinite(v) || v < 1) {
            throw badRequest('Invalid version');
        }
        const snapshot = await getProcessMapSnapshot(ctx, params.id, v);
        return jsonResponse(snapshot);
    },
);
