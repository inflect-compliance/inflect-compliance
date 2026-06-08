import { NextRequest, NextResponse } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import {
    updateEntraGroupMapping,
    deleteEntraGroupMapping,
} from '@/app-layer/usecases/entra-group-mappings';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * EI-2 — a single Entra group → IC-role mapping.
 * Gated by `admin.manage`; denials audit as AUTHZ_DENIED.
 */

/** PATCH — update a mapping's role / priority / cached name. */
export const PATCH = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; mappingId: string }>(
        'admin.manage',
        async (req: NextRequest, { params }, ctx) => {
            const body = await req.json();
            const updated = await updateEntraGroupMapping(ctx, params.mappingId, body);
            return jsonResponse(updated);
        },
    ),
);

/** DELETE — remove a mapping. */
export const DELETE = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; mappingId: string }>(
        'admin.manage',
        async (_req: NextRequest, { params }, ctx) => {
            await deleteEntraGroupMapping(ctx, params.mappingId);
            return new NextResponse(null, { status: 204 });
        },
    ),
);
