import { linkEvidence, unlinkEvidence } from '@/app-layer/usecases/incident';
import { LinkEvidenceSchema } from '@/app-layer/schemas/incident.schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';
import { z } from 'zod';

type IncidentParams = { tenantSlug: string; incidentId: string };

// POST — link a forensic Evidence record to the incident.
export const POST = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.manage', async (req, { params }, ctx) => {
        const { incidentId } = await params;
        const body = await parseJsonBody(req, LinkEvidenceSchema);
        const link = await linkEvidence(ctx, incidentId, body);
        return jsonResponse(link, { status: 201 });
    }),
);

const UnlinkEvidenceSchema = z.object({ evidenceId: z.string().min(1) });

// DELETE — unlink an Evidence record from the incident.
export const DELETE = withApiErrorHandling(
    requirePermission<IncidentParams>('incidents.manage', async (req, { params }, ctx) => {
        const { incidentId } = await params;
        const { evidenceId } = await parseJsonBody(req, UnlinkEvidenceSchema);
        const result = await unlinkEvidence(ctx, incidentId, evidenceId);
        return jsonResponse(result);
    }),
);
