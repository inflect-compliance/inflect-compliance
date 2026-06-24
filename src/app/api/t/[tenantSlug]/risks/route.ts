import { listRisks, listRisksPaginated, createRisk, listRisksWithDeleted } from '@/app-layer/usecases/risk';
import { CreateRiskSchema } from '@/lib/schemas';
import { withApiErrorHandling } from '@/lib/errors/api';
import { requirePermission } from '@/lib/security/permission-middleware';
import { parseJsonBody } from '@/lib/validation/route';
import { z } from 'zod';
import { normalizeQ } from '@/lib/filters/query-helpers';
import { jsonResponse } from '@/lib/api-response';
import { LIST_BACKFILL_CAP, applyBackfillCap } from '@/lib/list-backfill-cap';
import { recordListPageRowCount } from '@/lib/observability/list-page-metrics';

const RiskQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).optional(),
    cursor: z.string().optional(),
    status: z.string().optional(),
    scoreMin: z.coerce.number().int().min(0).optional(),
    scoreMax: z.coerce.number().int().min(0).optional(),
    category: z.string().optional(),
    ownerUserId: z.string().optional(),
    q: z.string().optional().transform(normalizeQ),
    includeDeleted: z.enum(['true', 'false']).optional(),
}).strip();

export const GET = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('risks.view', async (req, _routeArgs, ctx) => {
    const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
    const query = RiskQuerySchema.parse(sp);

    if (query.includeDeleted === 'true') {
        const risks = await listRisksWithDeleted(ctx);
        return jsonResponse(risks);
    }

    const hasPagination = query.limit || query.cursor;
    if (hasPagination) {
        const result = await listRisksPaginated(ctx, {
            limit: query.limit,
            cursor: query.cursor,
            filters: {
                status: query.status,
                scoreMin: query.scoreMin,
                scoreMax: query.scoreMax,
                category: query.category,
                ownerUserId: query.ownerUserId,
                q: query.q,
            },
        });
        return jsonResponse(result);
    }

    // PR-5 — backfill cap. Ask for cap+1 rows; helper slices and
    // reports `truncated`.
    const risks = await listRisks(
        ctx,
        {
            status: query.status,
            scoreMin: query.scoreMin,
            scoreMax: query.scoreMax,
            category: query.category,
            ownerUserId: query.ownerUserId,
            q: query.q,
        },
        { take: LIST_BACKFILL_CAP + 1 },
    );
    const result = applyBackfillCap(risks);
    // PR-6 — row-count observability.
    recordListPageRowCount({
        entity: 'risks',
        count: result.rows.length,
        truncated: result.truncated,
        tenantId: ctx.tenantId,
    });
    return jsonResponse(result);
}));

export const POST = withApiErrorHandling(requirePermission<{ tenantSlug: string }>('risks.create', async (req, _routeArgs, ctx) => {
    const body = await parseJsonBody(req, CreateRiskSchema);
    const risk = await createRisk(ctx, body);
    return jsonResponse(risk, { status: 201 });
}));
