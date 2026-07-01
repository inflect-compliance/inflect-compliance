import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listBias, createBia, getBiasForProcessNode, getBiasForProcessNodeKey, CreateBiaSchema } from '@/app-layer/usecases/business-impact-analysis';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * GET  /api/t/:slug/business-continuity            — BIA register (with recovery-priority rank).
 * GET  /api/t/:slug/business-continuity?processNodeId=… — BIAs for one process node (canvas cross-link).
 * POST /api/t/:slug/business-continuity            — create a BIA.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const sp = req.nextUrl.searchParams;
        // Canvas cross-link: resolve (processMapId, nodeKey) → BIAs + node id.
        const processMapId = sp.get('processMapId');
        const nodeKey = sp.get('nodeKey');
        if (processMapId && nodeKey) {
            return jsonResponse(await getBiasForProcessNodeKey(ctx, processMapId, nodeKey));
        }
        const processNodeId = sp.get('processNodeId');
        if (processNodeId) {
            return jsonResponse({ rows: await getBiasForProcessNode(ctx, processNodeId) });
        }
        return jsonResponse({ rows: await listBias(ctx, { criticality: sp.get('criticality') ?? undefined }) });
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(
        CreateBiaSchema,
        async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            return jsonResponse(await createBia(ctx, body), { status: 201 });
        },
    ),
);
