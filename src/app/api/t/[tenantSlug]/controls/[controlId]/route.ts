import { getControl, updateControl } from '@/app-layer/usecases/control';
import { UpdateControlSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

type ControlDetailParams = { tenantSlug: string; controlId: string };

export const GET = withApiErrorHandling(requirePermission<ControlDetailParams>('controls.view', async (_req, { params }, ctx) => {
    const { controlId } = await params;
    const control = await getControl(ctx, controlId);
    return jsonResponse(control);
}));

export const PATCH = withApiErrorHandling(requirePermission<ControlDetailParams>('controls.edit', async (req, { params }, ctx) => {
    const { controlId } = await params;
    const body = await parseJsonBody(req, UpdateControlSchema);
    const control = await updateControl(ctx, controlId, body);
    return jsonResponse(control);
}));
