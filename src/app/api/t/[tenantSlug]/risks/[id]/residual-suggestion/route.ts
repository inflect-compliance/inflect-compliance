import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import {
    getResidualSuggestion,
    acceptResidualSuggestion,
} from '@/app-layer/usecases/risk-residual-suggestion';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * RQ2-2 — control-derived residual suggestion.
 *
 * GET  — recompute + return the suggestion (read-only; reflects the
 *        current control links + test results on every call).
 * POST — accept it. Values are recomputed SERVER-SIDE inside the
 *        accept transaction — the body carries only an optional
 *        justification, never the numbers.
 */

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const payload = await getResidualSuggestion(ctx, params.id);
    return jsonResponse(payload);
});

const AcceptSchema = z.object({
    justification: z.string().max(2000).optional().nullable(),
}).strip();

export const POST = withApiErrorHandling(withValidatedBody(AcceptSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const accepted = await acceptResidualSuggestion(ctx, params.id, body);
    return jsonResponse({ success: true, accepted });
}));
