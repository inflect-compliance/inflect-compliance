import { getVendorDocExtraction } from '@/app-layer/usecases/vendor-doc-extraction';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; id: string };

/** GET — an extraction + its pending proposals (the review surface data). */
export const GET = withApiErrorHandling(
    requirePermission<Params>('vendors.view', async (_req, { params }, ctx) => {
        const { id } = await params;
        return jsonResponse(await getVendorDocExtraction(ctx, id));
    }),
);
