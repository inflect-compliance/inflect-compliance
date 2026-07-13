import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getCveSyncStatus } from '@/app-layer/usecases/vulnerability';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * GET /api/t/:slug/vulnerabilities/status
 *
 * CVE-sync freshness + reach for the tenant: whether the NVD sync is enabled,
 * the newest CVE lastModified timestamp (global catalog), and how many of the
 * tenant's assets carry product identity for matching. Plain tenant read —
 * mirrors the sibling /vulnerabilities routes (no requirePermission); the
 * middleware tenant-access gate + the usecase's assertCanRead govern access.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const status = await getCveSyncStatus(ctx);
        return jsonResponse(status);
    },
);
