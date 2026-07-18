import { restoreAsset } from '@/app-layer/usecases/asset';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type AssetDetailParams = { tenantSlug: string; id: string };

// Restore reverses a soft-delete — gated like every other asset mutation
// (matches the DELETE handler's `assets.edit`) so the denial audits cleanly
// via the Epic C.1 permission guard instead of a bare tenant-context check.
export const POST = withApiErrorHandling(requirePermission<AssetDetailParams>('assets.edit', async (_req, { params }, ctx) => {
    const { id } = await params;
    const result = await restoreAsset(ctx, id);
    return jsonResponse(result);
}));
