import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { runSimulation, getLatestSimulation } from '@/app-layer/usecases/monte-carlo';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-3 — Monte Carlo simulation: GET latest run, POST to run a new one. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ run: await getLatestSimulation(ctx) });
    },
);

const RunSchema = z.object({
    iterations: z.number().int().min(100).max(100_000).optional(),
    seed: z.number().int().optional(),
});

export const POST = withApiErrorHandling(
    withValidatedBody(RunSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const result = await runSimulation(ctx, body);
        return jsonResponse({ success: true, result });
    }),
);
