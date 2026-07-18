import { listAssets, listAssetsPaginated, createAsset, listAssetsWithDeleted } from '@/app-layer/usecases/asset';
import { parseJsonBody } from '@/lib/validation/route';
import { CreateAssetSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { z } from 'zod';
import { normalizeQ } from '@/lib/filters/query-helpers';
import { jsonResponse } from '@/lib/api-response';

const AssetQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    type: z.string().optional(),
    status: z.string().optional(),
    criticality: z.string().optional(),
    q: z.string().optional().transform(normalizeQ),
    includeDeleted: z.enum(['true', 'false']).optional(),
}).strip();

export const GET = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('assets.view', async (req, _routeArgs, ctx) => {
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = AssetQuerySchema.parse(sp);

    if (query.includeDeleted === 'true') {
        // Honour the same toolbar filters the client keeps active in deleted mode.
        const assets = await listAssetsWithDeleted(ctx, {
            type: query.type,
            status: query.status,
            criticality: query.criticality,
            q: query.q,
        });
        return jsonResponse(assets);
    }

    const hasPagination = query.limit || query.cursor;
    if (hasPagination) {
        const result = await listAssetsPaginated(ctx, {
            limit: query.limit,
            cursor: query.cursor,
            filters: {
                type: query.type,
                status: query.status,
                criticality: query.criticality,
                q: query.q,
            },
        });
        return jsonResponse(result);
    }

    // Backward compat: return flat array
    const assets = await listAssets(ctx, {
        type: query.type,
        status: query.status,
        criticality: query.criticality,
        q: query.q,
    });
    return jsonResponse(assets);
}));

export const POST = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('assets.create', async (req, _routeArgs, ctx) => {
    const body = await parseJsonBody(req, CreateAssetSchema);
    const asset = await createAsset(ctx, body);
    return jsonResponse(asset, { status: 201 });
}));
