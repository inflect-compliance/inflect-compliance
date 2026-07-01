import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { startStandaloneNis2Assessment } from '@/app-layer/usecases/onboarding-nis2';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** POST — start a fresh STANDALONE re-assessment run against the shared bank. */
export const POST = withApiErrorHandling(async (
    req: NextRequest,
    { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const run = await startStandaloneNis2Assessment(ctx);
    return jsonResponse({ id: run.id, source: 'STANDALONE', status: run.status });
});
