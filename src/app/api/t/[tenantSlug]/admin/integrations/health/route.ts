/**
 * GET /api/t/[tenantSlug]/admin/integrations/health
 *
 * GAP-3 — per-connection integration freshness. For every ENABLED
 * connection, the seconds since its last SUCCESSFUL (PASSED) execution,
 * plus a stale flag. Powers the admin integrations-health view. The same
 * signal is exported platform-wide as the DB-backed OTel gauge
 * `integration.connection.freshness_seconds`.
 *
 * Admin-only. No secrets in the response. Delegates to the app-layer.
 */
import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { withApiErrorHandling } from '@/lib/errors/api';
import { getConnectionsHealth } from '@/app-layer/usecases/integrations';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    requirePermission('admin.manage', async (_req: NextRequest, _routeArgs, ctx) => {
        const health = await getConnectionsHealth(ctx);
        return jsonResponse(health);
    }),
);
