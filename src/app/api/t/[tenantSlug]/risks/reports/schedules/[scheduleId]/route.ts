import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { updateSchedule, deleteSchedule } from '@/app-layer/usecases/risk-report';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-10 — single schedule: PATCH (pause/resume/edit), DELETE. */
const PatchSchema = z.object({
    isActive: z.boolean().optional(),
    cadence: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY']).optional(),
    recipients: z.array(z.string().email()).optional(),
});

export const PATCH = withApiErrorHandling(
    withValidatedBody(PatchSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; scheduleId: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await updateSchedule(ctx, params.scheduleId, body);
        return jsonResponse({ success: true });
    }),
);

export const DELETE = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; scheduleId: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await deleteSchedule(ctx, params.scheduleId);
        return jsonResponse({ success: true });
    },
);
