import { getAsset, updateAsset, deleteAsset } from '@/app-layer/usecases/asset';
import { parseJsonBody } from '@/lib/validation/route';
import { UpdateAssetSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type AssetDetailParams = { tenantSlug: string; id: string };

export const GET = withApiErrorHandling(requirePermission<AssetDetailParams>('assets.view', async (_req, { params }, ctx) => {
    const { id } = await params;
    const asset = await getAsset(ctx, id);
    return jsonResponse(asset);
}));

export const PUT = withApiErrorHandling(requirePermission<AssetDetailParams>('assets.edit', async (req, { params }, ctx) => {
    const { id } = await params;
    const body = await parseJsonBody(req, UpdateAssetSchema);
    const asset = await updateAsset(ctx, id, body);
    return jsonResponse({ success: true, asset });
}));

export const PATCH = PUT;

export const DELETE = withApiErrorHandling(requirePermission<AssetDetailParams>('assets.edit', async (_req, { params }, ctx) => {
    const { id } = await params;
    await deleteAsset(ctx, id);
    return jsonResponse({ success: true });
}));
