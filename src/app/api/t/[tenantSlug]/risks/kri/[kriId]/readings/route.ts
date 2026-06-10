import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { getReadings, recordReading } from '@/app-layer/usecases/key-risk-indicator';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-6 — KRI readings: GET history, POST record. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; kriId: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ readings: await getReadings(ctx, params.kriId, { limit: 200 }) });
    },
);

const RecordSchema = z.object({ value: z.number().finite(), note: z.string().max(2000).optional() });

export const POST = withApiErrorHandling(
    withValidatedBody(RecordSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; kriId: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await recordReading(ctx, params.kriId, body);
        return jsonResponse({ success: true, ...result });
    }),
);
