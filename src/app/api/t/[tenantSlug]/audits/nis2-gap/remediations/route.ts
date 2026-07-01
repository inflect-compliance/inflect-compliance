import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { proposeNis2Remediations, applyNis2Remediations } from '@/app-layer/usecases/nis2-gap-lifecycle';
import { ApplyRemediationsSchema, MinCriticalitySchema } from '@/app-layer/schemas/gap-assessment';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** GET — propose-not-commit: the ranked "Create these?" suggestion list. */
export const GET = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const raw = req.nextUrl.searchParams.get('minCriticality');
    const parsed = MinCriticalitySchema.safeParse(raw);
    return jsonResponse(await proposeNis2Remediations(ctx, parsed.success ? { minCriticality: parsed.data } : {}));
});

/** POST — commit approved suggestions (creates real Risks/Controls/Tasks). */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const body = ApplyRemediationsSchema.parse(await req.json().catch(() => ({})));
    return jsonResponse(await applyNis2Remediations(ctx, body.approvals));
});
