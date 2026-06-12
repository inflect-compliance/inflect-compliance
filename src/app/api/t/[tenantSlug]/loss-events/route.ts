/**
 * RQ3-6 — loss-event register.
 *
 *   GET  — list (cursor-paginated; ?riskId=… narrows to one risk).
 *   POST — record a loss event. Body fields are server-sanitised
 *          inside the usecase before the Epic B encryption
 *          middleware persists them.
 */
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { withValidatedBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { createLossEvent, listLossEvents } from '@/app-layer/usecases/loss-event';

const NewSchema = z.object({
    riskId: z.string().nullable().optional(),
    /** Calendar date the loss occurred. */
    occurredAt: z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'invalid date'),
    amount: z.number().finite().nonnegative(),
    description: z.string().max(10_000).nullable().optional(),
    source: z.enum(['USER', 'FINDING', 'INCIDENT']).optional(),
    justification: z.string().max(2_000).nullable().optional(),
});

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const url = new URL(req.url);
        const riskId = url.searchParams.get('riskId') ?? undefined;
        const cursor = url.searchParams.get('cursor') ?? undefined;
        const takeRaw = url.searchParams.get('take');
        const take = takeRaw ? Number(takeRaw) : undefined;
        return jsonResponse(await listLossEvents(ctx, { riskId, cursor, take }));
    },
);

export const POST = withApiErrorHandling(
    withValidatedBody(NewSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const event = await createLossEvent(ctx, body);
        return jsonResponse({ event });
    }),
);
