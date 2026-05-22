/**
 * GET /api/t/[tenantSlug]/tests/upcoming?windowDays=N&limit=M&controlId=...
 *
 * Epic G-2 — list of upcoming scheduled control test runs, anchored
 * on `ControlTestPlan.nextRunAt`. Distinct from the legacy
 * `/tests/due` endpoint which surfaces the deadline-monitor
 * `nextDueAt` queue.
 *
 * - `windowDays` clamps to [1, 365] (default 30)
 * - `limit`      clamps to [1, 200] (default 50)
 * - `controlId`  optional control-detail-page filter
 *
 * Permission gate: `assertCanReadTests` (canRead).
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getUpcomingTests } from '@/app-layer/usecases/test-scheduling';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const url = new URL(req.url);
        const windowDays = Number(url.searchParams.get('windowDays')) || undefined;
        const limit = Number(url.searchParams.get('limit')) || undefined;
        const controlId = url.searchParams.get('controlId') || undefined;
        const result = await getUpcomingTests(ctx, {
            windowDays,
            limit,
            controlId,
        });
        return jsonResponse(result);
    },
);
