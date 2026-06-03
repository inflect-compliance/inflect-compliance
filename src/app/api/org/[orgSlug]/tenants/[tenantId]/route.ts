/**
 * DELETE /api/org/[orgSlug]/tenants/[tenantId]
 *
 * Soft-delete ("remove") a tenant from the org admin panel. ORG_ADMIN
 * only (canManageTenants). The tenant is marked deleted — filtered out
 * of tenant resolution + all listings, so it becomes inaccessible — but
 * its data is retained (no hard purge). Org-scoped: only the org's own
 * tenants are reachable; a foreign id resolves to 404.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { deleteTenantUnderOrg } from '@/app-layer/usecases/org-tenants';
import { forbidden } from '@/lib/errors/types';

interface RouteContext {
    params: Promise<{ orgSlug: string; tenantId: string }>;
}

export const DELETE = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const params = await routeCtx.params;
        const ctx = await getOrgCtx(params, req);
        if (!ctx.permissions.canManageTenants) {
            throw forbidden(
                'You do not have permission to remove tenants from this organization',
            );
        }
        const result = await deleteTenantUnderOrg(ctx, params.tenantId);
        return NextResponse.json({ tenant: result.tenant }, { status: 200 });
    },
);
