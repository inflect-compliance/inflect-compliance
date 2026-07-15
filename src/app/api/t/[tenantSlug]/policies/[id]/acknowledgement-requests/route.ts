import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { parseJsonBody } from '@/lib/validation/route';
import {
    requirePolicyAcknowledgement,
    RequireAcknowledgementSchema,
} from '@/app-layer/usecases/policy-attestation';
import { jsonResponse } from '@/lib/api-response';

// POST /api/t/[tenantSlug]/policies/[id]/acknowledgement-requests — an admin
// REQUIRES a set of users (all / role / named list) to acknowledge the policy's
// currently-published version. PUBLISHED-gated + admin-gated in the usecase.
export const POST = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const body = await parseJsonBody(req, RequireAcknowledgementSchema);
        const result = await requirePolicyAcknowledgement(ctx, params.id, body);
        return jsonResponse(result, { status: 201 });
    },
);
