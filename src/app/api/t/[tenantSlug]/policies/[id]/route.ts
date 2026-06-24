import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { UpdatePolicyMetadataSchema } from '@/lib/schemas';
import * as policyUsecases from '@/app-layer/usecases/policy';
import { jsonResponse } from '@/lib/api-response';

type PolicyDetailParams = { tenantSlug: string; id: string };

// GET /api/t/[tenantSlug]/policies/[id] — detail with versions
export const GET = withApiErrorHandling(requirePermission<PolicyDetailParams>('policies.view', async (_req, { params }, ctx) => {
    const { id } = await params;
    const policy = await policyUsecases.getPolicy(ctx, id);
    return jsonResponse(policy);
}));

// PATCH /api/t/[tenantSlug]/policies/[id] — update metadata
export const PATCH = withApiErrorHandling(
    requirePermission<PolicyDetailParams>('policies.edit', async (req, { params }, ctx) => {
        const { id } = await params;
        const body = await parseJsonBody(req, UpdatePolicyMetadataSchema);
        const policy = await policyUsecases.updatePolicyMetadata(ctx, id, body);
        return jsonResponse(policy);
    })
);
