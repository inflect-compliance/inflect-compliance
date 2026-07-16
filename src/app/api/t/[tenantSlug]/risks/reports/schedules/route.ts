import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listSchedules, createSchedule } from '@/app-layer/usecases/risk-report';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-10 — report schedules: GET list, POST create. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ schedules: await listSchedules(ctx) });
    },
);

const CreateSchema = z.object({
    templateId: z.string().min(1),
    cadence: z.enum(['WEEKLY', 'MONTHLY', 'QUARTERLY']),
    format: z.enum(['PDF', 'CSV', 'PPTX']).optional(),
    recipients: z.array(z.string().email()).default([]),
    // PR-L — carry the RISK_DEEP_DIVE single-risk scope into the schedule.
    parameters: z.object({ confidenceLevel: z.number().optional(), riskId: z.string().optional() }).optional(),
    deliveryDay: z.number().int().optional(),
    sharePointDriveId: z.string().nullable().optional(),
    sharePointFolderId: z.string().nullable().optional(),
});

export const POST = withApiErrorHandling(
    withValidatedBody(CreateSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse({ success: true, schedule: await createSchedule(ctx, body) });
    }),
);
