import { runVendorMonitor } from '@/app-layer/usecases/vendor-monitoring';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; vendorId: string };

/**
 * POST /api/t/:slug/vendors/:vendorId/monitor/run
 * Run the posture monitor for this vendor on-demand (breach / attestation /
 * TLS). Creates the monitor row on first run. Gated under `vendors.edit`.
 */
export const POST = withApiErrorHandling(
    requirePermission<Params>('vendors.edit', async (_req, { params }, ctx) => {
        const { vendorId } = await params;
        const result = await runVendorMonitor(ctx, { vendorId });
        return jsonResponse(result, { status: 201 });
    }),
);
