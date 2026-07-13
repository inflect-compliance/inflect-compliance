import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { updateVulnerabilityStatus, VULN_STATUSES } from '@/app-layer/usecases/vulnerability';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

const UpdateSchema = z.object({
    status: z.enum(VULN_STATUSES).optional(),
    note: z.string().max(20_000).optional().nullable(),
    ownerUserId: z.string().max(200).optional().nullable(),
    remediationDueAt: z.string().max(40).optional().nullable(),
});

export const PATCH = withApiErrorHandling(withValidatedBody(UpdateSchema, async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const updated = await updateVulnerabilityStatus(ctx, params.id, body);
    return jsonResponse(updated);
}));
