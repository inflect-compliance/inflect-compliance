import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listVendorsLinkedToEntity } from '@/app-layer/usecases/vendor';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';

const ENTITY_TYPES = new Set(['ASSET', 'RISK', 'ISSUE', 'CONTROL']);

/**
 * GET /api/t/:slug/vendors/linked?entityType=RISK&entityId=<id>
 *
 * Reverse "where-used": the vendors linked to a given entity. Backs the
 * LinkedVendorsPanel on the Risk / Control / Asset / Task detail pages.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const entityType = req.nextUrl.searchParams.get('entityType') ?? '';
        const entityId = req.nextUrl.searchParams.get('entityId') ?? '';
        if (!ENTITY_TYPES.has(entityType) || !entityId) {
            throw badRequest('entityType (ASSET|RISK|ISSUE|CONTROL) and entityId are required');
        }
        const vendors = await listVendorsLinkedToEntity(ctx, entityType, entityId);
        return jsonResponse(vendors);
    },
);
