/**
 * RQ3-6 — soft-delete a loss event. ADMIN-only — actuals are
 * evidence; an EDITOR write flow must not destroy them silently.
 */
import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { deleteLossEvent } from '@/app-layer/usecases/loss-event';

export const DELETE = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        await deleteLossEvent(ctx, params.id);
        return jsonResponse({ success: true });
    },
);
