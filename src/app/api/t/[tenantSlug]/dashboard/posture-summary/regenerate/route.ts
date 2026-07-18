import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { generateCompliancePostureSummary } from '@/app-layer/usecases/compliance-posture';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/:tenantSlug/dashboard/posture-summary/regenerate
 *
 * On-demand regeneration of the cached AI compliance-posture summary. The
 * summary is derived from the tenant's control/compliance state, so it is
 * gated by `controls.edit` — the compliance-write capability that best
 * matches the action (excludes read-only viewers, and does not conflate
 * posture regeneration with report export). A denial writes a clean
 * AUTHZ_DENIED audit row. Runs the (optionally LLM-backed) generation off
 * the dashboard render path and returns the fresh result, which the hero
 * re-reads from cache.
 */
export const POST = withApiErrorHandling(
    requirePermission('controls.edit', async (_req, _args, ctx) => {
        const result = await generateCompliancePostureSummary(ctx);
        return jsonResponse(result);
    }),
);
