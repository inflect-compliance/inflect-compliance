import { NextRequest, NextResponse } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getAudit, updateAudit } from '@/app-layer/usecases/audit';
import { withValidatedBody } from '@/lib/validation/route';
import { UpdateAuditSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params }: { params: { tenantSlug: string; id: string } }) => {
    const ctx = await getTenantCtx(params, req);
    const audit = await getAudit(ctx, params.id);
    return jsonResponse(audit);
});

export const PUT = withApiErrorHandling(withValidatedBody(UpdateAuditSchema, async (req, { params }: { params: { tenantSlug: string; id: string } }, body) => {
    const ctx = await getTenantCtx(params, req);
    const audit = await updateAudit(ctx, params.id, body);
    return jsonResponse({ success: true, audit });
}));
