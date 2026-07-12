import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listRiskOptions } from '@/app-layer/usecases/risk-picker';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * P2 — lightweight `{ id, title }` risk list for the analytics pickers
 * (scenario overrides, KRI, loss-events, hierarchy links).
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ risks: await listRiskOptions(ctx) });
    },
);
