/**
 * Org-wide threat level — posture history (newest first) for the
 * widget's Sheet timeline. Read access (canViewPortfolio).
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getOrgThreatLevelHistory } from '@/app-layer/usecases/org-threat-level';

interface RouteContext {
    params: Promise<{ orgSlug: string }>;
}

export const GET = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx(await routeCtx.params, req);
        const history = await getOrgThreatLevelHistory(ctx, 50);
        return NextResponse.json({ history });
    },
);
