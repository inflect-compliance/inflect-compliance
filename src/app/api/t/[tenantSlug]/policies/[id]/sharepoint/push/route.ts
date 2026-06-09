import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { pushPolicyToSharePoint } from '@/app-layer/usecases/policy-sharepoint-sync';

/** SP-4 — manual push of the current policy content to SharePoint. policies.edit. */
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; id: string }>(
        'policies.edit',
        async (_req: NextRequest, { params }, ctx) => {
            await pushPolicyToSharePoint(ctx, params.id);
            return jsonResponse({ ok: true });
        },
    ),
);
