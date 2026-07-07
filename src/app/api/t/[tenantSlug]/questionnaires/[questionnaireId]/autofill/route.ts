import { autofillQuestionnaire } from '@/app-layer/usecases/questionnaire';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string; questionnaireId: string };
/** PR-9 — AI-autofill a questionnaire's pending items (controls.edit). */
export const POST = withApiErrorHandling(requirePermission<Params>('controls.edit', async (_req, { params }, ctx) => {
    const { questionnaireId } = await params;
    return jsonResponse(await autofillQuestionnaire(ctx, questionnaireId));
}));
