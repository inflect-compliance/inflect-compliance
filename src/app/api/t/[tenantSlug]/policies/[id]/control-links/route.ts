import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { parseJsonBody } from '@/lib/validation/route';
import { linkPolicyControls, unlinkPolicyControls } from '@/app-layer/usecases/policy-template-mapping';
import { jsonResponse } from '@/lib/api-response';

const LinkControlsSchema = z.object({
    controlIds: z.array(z.string().min(1)).min(1).max(200),
}).strip();

// POST /api/t/[tenantSlug]/policies/[id]/control-links — explicit
// confirm-and-link of suggested (or any tenant) controls to a policy.
// The ONLY write path for template-driven PolicyControlLinks.
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = await parseJsonBody(req, LinkControlsSchema);
    const result = await linkPolicyControls(ctx, params.id, body.controlIds);
    return jsonResponse(result, { status: 201 });
});

// DELETE /api/t/[tenantSlug]/policies/[id]/control-links — unlink one or more
// controls from a policy (the inverse of POST). controlIds in the JSON body.
export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = await parseJsonBody(req, LinkControlsSchema);
    const result = await unlinkPolicyControls(ctx, params.id, body.controlIds);
    return jsonResponse(result);
});
