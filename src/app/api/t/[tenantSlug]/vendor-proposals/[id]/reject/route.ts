import { rejectProposal } from '@/app-layer/usecases/vendor-doc-extraction';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; id: string };

/** POST — reject a proposed answer. No answer is written. */
export const POST = withApiErrorHandling(
    requirePermission<Params>('vendors.edit', async (_req, { params }, ctx) => {
        const { id } = await params;
        return jsonResponse(await rejectProposal(ctx, id));
    }),
);
