import { NextRequest } from 'next/server';
import { z } from 'zod';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { parseJsonBody } from '@/lib/validation/route';
import { linkPolicyEvidenceItem, unlinkPolicyEvidenceItem } from '@/app-layer/usecases/policy-evidence';
import { jsonResponse } from '@/lib/api-response';

const LinkSchema = z.object({ evidenceId: z.string().min(1).nullable() }).strip();

// PATCH — link ({evidenceId}) or unlink ({evidenceId: null}) a checklist item.
export const PATCH = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string; itemId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = await parseJsonBody(req, LinkSchema);
    const result = body.evidenceId
        ? await linkPolicyEvidenceItem(ctx, params.id, params.itemId, body.evidenceId)
        : await unlinkPolicyEvidenceItem(ctx, params.id, params.itemId);
    return jsonResponse(result);
});
