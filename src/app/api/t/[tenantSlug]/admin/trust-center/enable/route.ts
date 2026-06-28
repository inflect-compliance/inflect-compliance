import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requirePermission } from '@/lib/security/permission-middleware';
import { setTrustCenterEnabled } from '@/app-layer/usecases/trust-center';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

const EnableSchema = z.object({ enabled: z.boolean() });

// Publishing the Trust Center exposes company data on the public internet —
// OWNER-tier (admin.tenant_lifecycle), audited in the usecase.
export const POST = withApiErrorHandling(
    requirePermission('admin.tenant_lifecycle', async (req: NextRequest, _routeArgs, ctx) => {
        const body = await req.json();
        const { enabled } = EnableSchema.parse(body);
        const tc = await setTrustCenterEnabled(ctx, enabled);
        return jsonResponse({ enabled: tc.enabled, slug: tc.slug });
    }),
);
