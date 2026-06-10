import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { suggestCorrelations } from '@/app-layer/usecases/risk-correlation';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-8 — auto-suggest correlations from shared assets/controls. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ suggestions: await suggestCorrelations(ctx) });
    },
);
