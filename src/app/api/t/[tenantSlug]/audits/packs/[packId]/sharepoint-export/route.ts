import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { exportAuditPackToSharePoint } from '@/app-layer/usecases/audit-pack-sharepoint-export';

/**
 * SP-5 — export a FROZEN audit pack to SharePoint. Gated by `admin.manage`.
 */
const Body = z.object({
    connectionId: z.string().min(1).optional(),
    driveId: z.string().min(1),
    folderId: z.string().min(1).optional(),
    namingTemplate: z.string().max(120).optional(),
});

export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; packId: string }>(
        'admin.manage',
        async (req: NextRequest, { params }, ctx) => {
            const body = Body.parse(await req.json());
            return jsonResponse(await exportAuditPackToSharePoint(ctx, params.packId, body), { status: 201 });
        },
    ),
);
