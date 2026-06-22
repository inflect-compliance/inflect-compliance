/**
 * Admin route for the tenant-scoped risk-matrix configuration —
 * Epic 44.
 *
 *   - GET — same payload as `/risk-matrix-config`, mirrored here so
 *     the admin UI can read + write off a single base path.
 *   - PUT — validate + upsert. Patch-shaped — any subset of the
 *     fields can land; the usecase merges over the prior effective
 *     config, validates cross-field invariants (band coverage,
 *     label-array length), and writes a single row.
 *
 * Both methods are gated by `admin.manage`; the route map in
 * `route-permissions.ts` carries the rule so the coverage guardrail
 * picks it up.
 */

import { NextRequest } from 'next/server';

import { requirePermission } from '@/lib/security/permission-middleware';
import {
    getRiskMatrixConfig,
    updateRiskMatrixConfig,
} from '@/app-layer/usecases/risk-matrix-config';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (_req: NextRequest, _routeArgs, ctx) => {
        const config = await getRiskMatrixConfig(ctx);
        return jsonResponse(config);
    }),
);

export const PUT = withApiErrorHandling(
    requirePermission('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
        const next = await updateRiskMatrixConfig(ctx, body);
        return jsonResponse(next);
    }),
);
