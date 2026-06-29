import { getIncident, updateIncident } from '@/app-layer/usecases/incident';
import { UpdateIncidentSchema } from '@/app-layer/schemas/incident.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type IncidentParams = { tenantSlug: string; incidentId: string };

export const GET = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.view', async (_req, { params }, ctx) => {
        const { incidentId } = await params;
        const incident = await getIncident(ctx, incidentId);
        return jsonResponse(incident);
    }),
);

export const PATCH = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.manage', async (req, { params }, ctx) => {
        const { incidentId } = await params;
        const body = await parseJsonBody(req, UpdateIncidentSchema);
        const incident = await updateIncident(ctx, incidentId, body);
        return jsonResponse(incident);
    }),
);
