import { NextRequest } from 'next/server';
import { requirePermission } from '@/lib/security/permission-middleware';
import { listConnectedAccounts } from '@/app-layer/usecases/integrations';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

type Params = { tenantSlug: string };

/**
 * GET /api/t/[tenantSlug]/admin/integrations/identity-accounts
 *
 * P1 — the synced-identity roster (Okta / Google Workspace). Browsable so a
 * directory sync is visible and a CONNECTED_APP access review can be
 * pre-checked instead of throwing on empty.
 */
export const GET = withApiErrorHandling(
    requirePermission<Params>('admin.manage', async (req: NextRequest, _routeArgs, ctx) => {
        const provider = new URL(req.url).searchParams.get('provider') ?? undefined;
        const accounts = await listConnectedAccounts(ctx, { provider });
        return jsonResponse({ accounts });
    }),
);
