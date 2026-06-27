import { NextRequest } from 'next/server';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getTenantCtx } from '@/app-layer/context';
import { getSuggestedControlLinks } from '@/app-layer/usecases/policy-template-mapping';
import { jsonResponse } from '@/lib/api-response';
import { badRequest } from '@/lib/errors/types';

// GET /api/t/[tenantSlug]/policies/templates/suggestions?ref=POL-02
// → framework-aware control-link suggestions for a template, resolved
//   against the tenant's installed frameworks. Read-only; no links are
//   created here (see POST /policies/[id]/control-links to confirm).
export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const ref = req.nextUrl.searchParams.get('ref');
    if (!ref) throw badRequest('Missing template ref');
    const result = await getSuggestedControlLinks(ctx, ref);
    return jsonResponse(result);
});
