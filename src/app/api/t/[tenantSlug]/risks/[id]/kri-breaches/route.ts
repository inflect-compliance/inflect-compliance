/**
 * RQ3-7 — currently-breached KRIs for one risk.
 *
 * Powers the Assessment tab's "re-assess" nudge: the active KRIs
 * linked to this risk whose latest reading is RED. Empty = no live
 * signal → no nudge. Read-only; recomputed per call so a recovery
 * (later non-RED reading) silences the nudge with no extra state.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { getRiskKriBreaches } from '@/app-layer/usecases/key-risk-indicator';

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const breaches = await getRiskKriBreaches(ctx, params.id);
        return jsonResponse({ breaches });
    },
);
