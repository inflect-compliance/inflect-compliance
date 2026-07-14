import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listAuditors, inviteAuditor } from '@/app-layer/usecases/audit-readiness';
import { withApiErrorHandling } from '@/lib/errors/api';
import { z } from 'zod';
import { jsonResponse } from '@/lib/api-response';

// Named-auditor management surface (tenant admin). Authorization is
// enforced in the usecase layer via `assertCanManageAuditors`
// (OWNER/ADMIN only) — mirroring the sibling audit-pack routes, which
// authorise through the audit-readiness policies rather than the
// route-permission map.
const InviteAuditorSchema = z.object({
    email: z.string().email('Valid email required'),
    name: z.string().max(200).optional(),
}).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    return jsonResponse(await listAuditors(ctx));
});

export const POST = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = InviteAuditorSchema.parse(await req.json());
    return jsonResponse(await inviteAuditor(ctx, body.email, body.name), { status: 201 });
});
