import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { attestPolicy } from '@/app-layer/usecases/policy-attestation';
import { jsonResponse } from '@/lib/api-response';

// POST /api/t/[tenantSlug]/policies/[id]/attest — the current user records
// that they have read + accepted the policy's currently-published version.
// PUBLISHED-gated + idempotent on @@unique([policyVersionId, userId]) inside
// the usecase. authz + audit (POLICY_ATTESTED) live in the usecase.
export const POST = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await attestPolicy(ctx, params.id);
        // 201 on first attestation, 200 when the idempotent path returns the existing row.
        return jsonResponse(result, { status: result.created ? 201 : 200 });
    },
);
