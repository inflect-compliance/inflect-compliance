/**
 * Org security-maturity — overall-over-time trend (read access).
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getOrgMaturityTrend } from '@/app-layer/usecases/org-maturity';

interface RouteContext {
    params: Promise<{ orgSlug: string }>;
}

export const GET = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx(await routeCtx.params, req);
        const trend = await getOrgMaturityTrend(ctx, 12);
        return NextResponse.json({ trend });
    },
);
