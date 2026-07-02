import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { generateCompliancePostureSummary } from '@/app-layer/usecases/compliance-posture';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/:tenantSlug/dashboard/posture-summary/regenerate
 *
 * On-demand regeneration of the cached AI compliance-posture summary. Gated
 * by `reports.export` (write-capable roles; excludes read-only viewers) so a
 * denial writes a clean AUTHZ_DENIED audit row. Runs the (optionally LLM-
 * backed) generation off the dashboard render path and returns the fresh
 * result, which the hero re-reads from cache.
 */
export const POST = withApiErrorHandling(
    requirePermission('reports.export', async (_req, _args, ctx) => {
        const result = await generateCompliancePostureSummary(ctx);
        return jsonResponse(result);
    }),
);
