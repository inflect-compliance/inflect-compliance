import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { listSubprocessorChain } from '@/app-layer/usecases/vendor-audit';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * GET /api/t/:slug/vendors/:vendorId/subprocessors/chain
 *
 * Recursive nth-party (4th-party+) subprocessor chain as a nested tree.
 * Bounded depth + cycle-safe. Backs the recursive subprocessor view on the
 * vendor detail page.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; vendorId: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        return jsonResponse(await listSubprocessorChain(ctx, params.vendorId));
    },
);
