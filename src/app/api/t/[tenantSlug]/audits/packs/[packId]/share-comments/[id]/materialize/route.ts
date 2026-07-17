import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { materializeShareCommentFinding } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

// feat/audit-cycle-unify — turn an external auditor's FINDING / EVIDENCE_REQUEST
// return-channel entry into a real Finding (+ remediation Task) tied to the
// pack's cycle, then mark the comment resolved with a link to the finding.
export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; packId: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await materializeShareCommentFinding(ctx, params.packId, params.id));
});
