import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listPackShares } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// Active + revoked share links minted for a pack. Authorization is
// enforced in the usecase via `assertCanSharePack` (OWNER/ADMIN only).
// Raw tokens are never returned — only their lifecycle metadata.
export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; packId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await listPackShares(ctx, params.packId));
});
