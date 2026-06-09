import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { pullPolicyByIdFromSharePoint } from '@/app-layer/usecases/policy-sharepoint-sync';

/** SP-4 — manual pull: create a new policy version from SharePoint. policies.edit. */
export const POST = withApiErrorHandling(
    requirePermission<{ tenantSlug: string; policyId: string }>(
        'policies.edit',
        async (_req: NextRequest, { params }, ctx) => {
            return jsonResponse(await pullPolicyByIdFromSharePoint(ctx, params.policyId));
        },
    ),
);
