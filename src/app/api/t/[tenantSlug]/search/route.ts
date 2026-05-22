/**
 * Unified tenant-scoped global search endpoint.
 *
 * GET /api/t/[tenantSlug]/search?q=<query>[&limit=<n>]
 *
 * Returns a typed `SearchResponse` (`@/lib/search/types`):
 * mixed-entity hits ranked highest-relevance-first, capped per
 * type, with meta echoing the query the API used + per-type
 * counts + truncation flag.
 *
 * Replaces the per-entity fan-out the command palette used to do
 * client-side. Every search now goes through ONE endpoint so
 * ranking, limits, and result shape live in one place.
 *
 * Auth: tenant-scoped via `getTenantCtx` (same gate as every
 * other `/api/t/<slug>/...` route). The usecase enforces
 * `assertCanRead`-equivalent via a role check.
 *
 * Read-tier rate-limited automatically at the edge
 * (`API_READ_LIMIT`, GAP-17 — every tenant-scoped GET goes
 * through it).
 */

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getUnifiedSearch } from '@/app-layer/usecases/search';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import { DEFAULT_PER_TYPE_LIMIT } from '@/lib/search/types';

function parseLimit(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    if (!Number.isFinite(n) || n <= 0) return undefined;
    // Hard ceiling — even a power user shouldn't pull more than
    // 25 hits per type from one search call. Above that they
    // should be using the entity list pages directly.
    return Math.min(n, 25);
}

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const url = new URL(req.url);
        const q = url.searchParams.get('q') ?? '';
        const limit = parseLimit(url.searchParams.get('limit'));
        const result = await getUnifiedSearch(ctx, q, {
            perTypeLimit: limit ?? DEFAULT_PER_TYPE_LIMIT,
        });
        return jsonResponse(result);
    },
);
