/**
 * Epic 41 — Configurable Dashboard Widget Engine.
 *
 *   POST /api/org/[orgSlug]/dashboard/widgets/reset
 *      Reconcile a drifted org dashboard back to the recommended
 *      default layout. Deletes every widget the org owns and re-seeds
 *      the default preset. Deliberately destructive — preserves
 *      nothing.
 *
 * Resolves OrgContext via `getOrgCtx` and gates on the write
 * permission (`canConfigureDashboard`) inside the usecase, exactly
 * like the sibling `widgets` route. No request body — the action is
 * fully determined by the preset.
 */
import { NextRequest, NextResponse } from 'next/server';

import { getOrgCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { resetOrgDashboardToPreset } from '@/app-layer/usecases/org-dashboard-widgets';

interface RouteContext {
    params: Promise<{ orgSlug: string }>;
}

export const POST = withApiErrorHandling(
    async (req: NextRequest, routeCtx: RouteContext) => {
        const ctx = await getOrgCtx((await routeCtx.params), req);
        const widgets = await resetOrgDashboardToPreset(ctx);
        return NextResponse.json({ widgets });
    },
);
