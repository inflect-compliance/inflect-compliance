import { listIncidents, createIncident } from '@/app-layer/usecases/incident';
import { CreateIncidentSchema } from '@/app-layer/schemas/incident.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    requirePermission('incidents.view', async (_req, _routeArgs, ctx) => {
        const incidents = await listIncidents(ctx);
        return jsonResponse(incidents);
    }),
);

export const POST = withApiErrorHandling(
    requirePermission('incidents.manage', async (req, _routeArgs, ctx) => {
        const body = await parseJsonBody(req, CreateIncidentSchema);
        const incident = await createIncident(ctx, body);
        return jsonResponse(incident, { status: 201 });
    }),
);
