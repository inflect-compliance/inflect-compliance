/**
 * DELETE /api/t/[tenantSlug]/evidence/[id]/controls/[controlId]
 * EP-3 — unlink an evidence record from a control (deletes the
 * EvidenceControlLink). The Evidence row survives — this is a detach.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { unlinkEvidenceFromControl } from '@/app-layer/usecases/evidence';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string; controlId: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const result = await unlinkEvidenceFromControl(ctx, params.id, params.controlId);
    return jsonResponse(result);
});
