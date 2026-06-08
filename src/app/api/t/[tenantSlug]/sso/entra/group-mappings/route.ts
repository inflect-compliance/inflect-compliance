import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import {
    listEntraGroupMappings,
    createEntraGroupMapping,
} from '@/app-layer/usecases/entra-group-mappings';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * EI-2 — Entra group → IC-role mappings collection.
 * Gated by `admin.manage` (the SSO config root); denials audit as AUTHZ_DENIED.
 */

/** GET — list this tenant's group mappings (highest priority first). */
export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (_req: NextRequest, _routeArgs, ctx) => {
        const mappings = await listEntraGroupMappings(ctx);
        return jsonResponse(mappings);
    }),
);

/** POST — create a group → role mapping. */
export const POST = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const body = await req.json();
        const created = await createEntraGroupMapping(ctx, body);
        return jsonResponse(created, { status: 201 });
    }),
);
