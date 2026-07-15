import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { getPolicyAcknowledgementRoster } from '@/app-layer/usecases/policy-attestation';
import { jsonResponse } from '@/lib/api-response';

// GET /api/t/[tenantSlug]/policies/[id]/attestations — admin acknowledgement
// roster for the current published version: who was required, who has
// acknowledged (timestamps), % complete, and voluntary acknowledgers.
// Admin/audit-gated in the usecase.
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const roster = await getPolicyAcknowledgementRoster(ctx, params.id);
        return jsonResponse(roster);
    },
);
