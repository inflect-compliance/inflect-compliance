import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { getPolicyAttestation } from '@/app-layer/usecases/policy-attestation';
import { jsonResponse } from '@/lib/api-response';

// GET /api/t/[tenantSlug]/policies/[id]/attestation — the caller's own
// attestation status for the policy's current published version. An admin may
// query another user's status via ?userId= (the usecase enforces admin for a
// non-self lookup).
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const userId = req.nextUrl.searchParams.get('userId') ?? undefined;
        const attestation = await getPolicyAttestation(ctx, params.id, userId);
        return jsonResponse({ attested: attestation !== null, attestation });
    },
);
