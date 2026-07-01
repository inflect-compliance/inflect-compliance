import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getControlBiaSurface } from '@/app-layer/usecases/business-impact-analysis';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * GET — the conditional BIA surface for a control (cases 4a/4b/4c):
 *   { kind: 'continuity', bias } | { kind: 'process', … } | { kind: 'none' }.
 * The control detail UI renders a section (continuity) or a chip (process),
 * and NOTHING for 'none' — the no-dead-tab contract.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: p }: { params: Promise<{ tenantSlug: string; controlId: string }> }) => {
        const params = await p;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse(await getControlBiaSurface(ctx, params.controlId));
    },
);
