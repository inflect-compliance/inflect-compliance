import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listKris, createKri } from '@/app-layer/usecases/key-risk-indicator';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-6 — KRI list + create. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const url = new URL(req.url);
        const active = url.searchParams.get('active');
        return jsonResponse({ kris: await listKris(ctx, { riskId: url.searchParams.get('riskId') ?? undefined, isActive: active == null ? undefined : active === 'true' }) });
    },
);

const CreateSchema = z.object({
    name: z.string().min(1).max(200),
    riskId: z.string().nullable().optional(),
    description: z.string().max(2000).nullable().optional(),
    unit: z.string().max(20).nullable().optional(),
    direction: z.enum(['HIGHER_IS_WORSE', 'LOWER_IS_WORSE']).optional(),
    greenMax: z.number().nullable().optional(),
    amberMax: z.number().nullable().optional(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY']).optional(),
    ownerUserId: z.string().nullable().optional(),
    targetValue: z.number().nullable().optional(),
});

export const POST = withApiErrorHandling(
    withValidatedBody(CreateSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ success: true, kri: await createKri(ctx, body) });
    }),
);
