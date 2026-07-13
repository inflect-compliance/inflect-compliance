import { getControlHealth } from '@/app-layer/usecases/control';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type ControlHealthParams = { tenantSlug: string; controlId: string };

/**
 * R2-P2 — control health synthesis for the detail Overview.
 *
 * Aggregates status + applicability + latest test result + latest automated
 * check status + effectiveness + coverage contribution into one payload.
 * Read-only; gated by the same `controls.view` permission as the control.
 */
export const GET = withApiErrorHandling(
    requirePermission<ControlHealthParams>('controls.view', async (_req, { params }, ctx) => {
        const { controlId } = await params;
        return jsonResponse(await getControlHealth(ctx, controlId));
    }),
);
