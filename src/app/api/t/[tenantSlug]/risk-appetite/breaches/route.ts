import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listBreaches, acknowledgeBreach } from '@/app-layer/usecases/risk-appetite';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-2 — appetite breach history + acknowledgement. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ breaches: await listBreaches(ctx) });
    },
);

const AckSchema = z.object({ breachId: z.string().min(1), note: z.string().max(2000).optional() });

export const POST = withApiErrorHandling(
    withValidatedBody(AckSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await acknowledgeBreach(ctx, body.breachId, body.note);
        return jsonResponse({ success: true });
    }),
);
