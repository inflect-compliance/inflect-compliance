import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { cloneScenario } from '@/app-layer/usecases/risk-scenario';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** PR-L — clone a scenario (name + overrides) so a mis-created what-if is fixable in-app. */
const CloneSchema = z.object({ name: z.string().min(1).max(200) }).strip();

export const POST = withApiErrorHandling(
    withValidatedBody(
        CloneSchema,
        async (
            req: NextRequest,
            { params: paramsPromise }: { params: Promise<{ tenantSlug: string; scenarioId: string }> },
            body,
        ) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const scenario = await cloneScenario(ctx, params.scenarioId, body.name);
            return jsonResponse({ success: true, scenario }, { status: 201 });
        },
    ),
);
