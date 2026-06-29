import { linkControls } from '@/app-layer/usecases/incident';
import { LinkControlsSchema } from '@/app-layer/schemas/incident.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type IncidentParams = { tenantSlug: string; incidentId: string };

// PUT — replace the set of Art.21(2) controls linked to this incident.
export const PUT = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.manage', async (req, { params }, ctx) => {
        const { incidentId } = await params;
        const body = await parseJsonBody(req, LinkControlsSchema);
        const incident = await linkControls(ctx, incidentId, body);
        return jsonResponse(incident);
    }),
);
