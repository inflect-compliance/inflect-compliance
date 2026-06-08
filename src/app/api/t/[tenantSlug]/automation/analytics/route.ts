import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { getAutomationAnalytics } from '@/app-layer/usecases/automation-analytics';

type Ctx = { params: Promise<{ tenantSlug: string }> };

const QuerySchema = z.object({ days: z.coerce.number().int().min(1).max(365).optional() }).strip();

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: Ctx) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const { days } = QuerySchema.parse(Object.fromEntries(req.nextUrl.searchParams.entries()));
    const data = await getAutomationAnalytics(ctx, days ?? 30);
    return jsonResponse(data);
});
