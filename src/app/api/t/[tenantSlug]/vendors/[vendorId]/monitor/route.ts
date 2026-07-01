import { z } from 'zod';
import { getVendorPosture, updateVendorMonitor } from '@/app-layer/usecases/vendor-monitoring';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; vendorId: string };

const PatchSchema = z.object({
    enabled: z.boolean().optional(),
    checkAttestation: z.boolean().optional(),
    checkBreach: z.boolean().optional(),
    checkTls: z.boolean().optional(),
    materializeFindings: z.boolean().optional(),
});

/**
 * GET /api/t/:slug/vendors/:vendorId/monitor
 * The vendor's monitor config + latest state + posture timeline. Gated under
 * `vendors.view`.
 */
export const GET = withApiErrorHandling(
    requirePermission<Params>('vendors.view', async (_req, { params }, ctx) => {
        const { vendorId } = await params;
        const result = await getVendorPosture(ctx, vendorId);
        return jsonResponse(result);
    }),
);

/**
 * PATCH /api/t/:slug/vendors/:vendorId/monitor
 * Toggle monitoring config (enable/disable, per-signal, materialise-findings).
 * Gated under `vendors.edit`.
 */
export const PATCH = withApiErrorHandling(
    requirePermission<Params>('vendors.edit', async (req, { params }, ctx) => {
        const { vendorId } = await params;
        const body = await parseJsonBody(req, PatchSchema);
        const result = await updateVendorMonitor(ctx, vendorId, body);
        return jsonResponse(result);
    }),
);
