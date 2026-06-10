import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listTemplates, listReports, generateReport } from '@/app-layer/usecases/risk-report';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/** RQ-10 — reports: GET templates + recent runs, POST to generate. */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const [templates, reports] = await Promise.all([listTemplates(ctx), listReports(ctx, { limit: 50 })]);
        return jsonResponse({ templates, reports });
    },
);

const GenSchema = z.object({
    templateId: z.string().min(1),
    format: z.enum(['PDF', 'CSV']),
    parameters: z.object({ confidenceLevel: z.number().optional(), riskId: z.string().optional() }).optional(),
});

export const POST = withApiErrorHandling(
    withValidatedBody(GenSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const run = await generateReport(ctx, body.templateId, body.parameters ?? {}, body.format);
        return jsonResponse({ success: true, run });
    }),
);
