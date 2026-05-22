/**
 * Epic 47.1 — Traceability graph endpoint.
 *
 * GET /api/t/[tenantSlug]/traceability/graph[?kinds=...&focusId=...&focusRadius=...]
 *
 * Returns a `TraceabilityGraph` payload (typed at
 * `@/lib/traceability-graph/types`): nodes + edges + categories +
 * meta. Tenant-scoped via `getTenantCtx` + RLS-bound reads inside
 * the usecase.
 *
 * Query params (all optional — every filter is enforced
 * server-side by `getTraceabilityGraph` before payload assembly):
 *
 *   `kinds=control,risk,asset` — restrict to a subset of entity
 *       categories. Comma-separated; unknown values are dropped.
 *   `focusId=<cuid>` — reserved for the phase-2 focus + expand
 *       mode; the MVP usecase echoes it back in `meta.appliedFilters`
 *       but does not yet narrow the result.
 *   `focusRadius=<int>` — paired with `focusId`.
 *
 * Read-tier rate-limited automatically at the edge
 * (`API_READ_LIMIT`, GAP-17 — every tenant-scoped GET goes
 * through it).
 */

import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { getTraceabilityGraph } from '@/app-layer/usecases/traceability-graph';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';
import type { TraceabilityNodeKind } from '@/lib/traceability-graph/types';

const ALLOWED_KINDS: ReadonlySet<TraceabilityNodeKind> = new Set([
    'control',
    'risk',
    'asset',
    'requirement',
]);

function parseKinds(raw: string | null): TraceabilityNodeKind[] | undefined {
    if (!raw) return undefined;
    const out: TraceabilityNodeKind[] = [];
    for (const part of raw.split(',').map((s) => s.trim()).filter(Boolean)) {
        if (ALLOWED_KINDS.has(part as TraceabilityNodeKind)) {
            out.push(part as TraceabilityNodeKind);
        }
    }
    return out.length > 0 ? out : undefined;
}

function parseRadius(raw: string | null): number | undefined {
    if (!raw) return undefined;
    const n = Number.parseInt(raw, 10);
    if (Number.isNaN(n) || n < 0 || n > 10) return undefined;
    return n;
}

export const GET = withApiErrorHandling(
    async (
        req: NextRequest,
        { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> },
    ) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const url = new URL(req.url);
        const kinds = parseKinds(url.searchParams.get('kinds'));
        const focusId = url.searchParams.get('focusId') || undefined;
        const focusRadius = parseRadius(url.searchParams.get('focusRadius'));

        const graph = await getTraceabilityGraph(ctx, {
            filters: {
                ...(kinds ? { kinds } : {}),
                ...(focusId ? { focusId } : {}),
                ...(focusRadius !== undefined ? { focusRadius } : {}),
            },
        });
        return jsonResponse(graph);
    },
);
