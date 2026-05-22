/**
 * GET /api/t/:tenantSlug/controls/:controlId/page-data
 *
 * Single-call data contract for the control detail page. Replaces
 * the previous client-side waterfall:
 *
 *   1. GET /controls/:id            (always)
 *   2. GET /controls/:id/sync       (gated on step 1, conditional)
 *
 * with one client→server round-trip. The legacy `/sync` endpoint is
 * retained — admin tools and the manual "Sync Now" action still use
 * it.
 *
 * See `getControlPageData` for failure-mode semantics: a failed sync
 * lookup degrades to `syncStatus: null` rather than failing the
 * whole call.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getControlPageData } from '@/app-layer/usecases/control';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string; controlId: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse(await getControlPageData(ctx, params.controlId));
    },
);
