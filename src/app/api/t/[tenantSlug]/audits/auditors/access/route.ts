import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { grantAuditorAccess, revokeAuditorAccess } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { jsonResponse } from '@/lib/api-response';

// Per-pack auditor access grant/revoke. Authorization is enforced in the
// usecase layer via `assertCanManageAuditors` (OWNER/ADMIN only).
const AccessSchema = z.object({
    auditorId: z.string().min(1),
    packId: z.string().min(1),
}).strip();

export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = AccessSchema.parse(await req.json());
    return jsonResponse(await grantAuditorAccess(ctx, body.auditorId, body.packId), { status: 201 });
});

export const DELETE = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = AccessSchema.parse(await req.json());
    return jsonResponse(await revokeAuditorAccess(ctx, body.auditorId, body.packId));
});
