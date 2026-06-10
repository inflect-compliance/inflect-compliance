import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { getTree, getTreemapData, createNode } from '@/app-layer/usecases/risk-hierarchy';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-5 — hierarchy: GET nodes + treemap for a type, POST create a node. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const type = new URL(req.url).searchParams.get('type') ?? 'BUSINESS_UNIT';
        const [nodes, treemap] = await Promise.all([getTree(ctx, type), getTreemapData(ctx, type)]);
        return jsonResponse({ nodes, treemap });
    },
);

const CreateSchema = z.object({
    name: z.string().min(1).max(200),
    type: z.enum(['BUSINESS_UNIT', 'GEOGRAPHY', 'ASSET_CLASS', 'CUSTOM']),
    parentId: z.string().nullable().optional(),
    sortOrder: z.number().int().optional(),
});

export const POST = withApiErrorHandling(
    withValidatedBody(CreateSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ success: true, node: await createNode(ctx, body) });
    }),
);
