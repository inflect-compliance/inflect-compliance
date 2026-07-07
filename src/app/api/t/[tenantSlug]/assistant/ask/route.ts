import { askAssistant, AskAssistantSchema } from '@/app-layer/usecases/assistant';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { jsonResponse } from '@/lib/api-response';

/**
 * PR-10 — conversational compliance assistant. Read-mostly: answers posture
 * questions from live tenant data and queues actions as agent-proposals for
 * human approval (never a direct mutation). Requires read permission
 * (`controls.view`) — proposing is safe because it lands in the review queue.
 */
export const POST = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('controls.view', async (req, _a, ctx) => {
    const body = await parseJsonBody(req, AskAssistantSchema);
    return jsonResponse(await askAssistant(ctx, body));
}));
