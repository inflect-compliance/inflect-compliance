import { uploadQuestionnaire, listQuestionnaires, UploadQuestionnaireSchema } from '@/app-layer/usecases/questionnaire';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/** PR-9 — inbound questionnaires. List (controls.view) + upload (controls.edit). */
export const GET = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('controls.view', async (_req, _a, ctx) => {
    return jsonResponse({ questionnaires: await listQuestionnaires(ctx) });
}));
export const POST = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('controls.edit', async (req, _a, ctx) => {
    const body = await parseJsonBody(req, UploadQuestionnaireSchema);
    return jsonResponse(await uploadQuestionnaire(ctx, body), { status: 201 });
}));
