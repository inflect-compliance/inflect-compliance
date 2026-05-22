/**
 * GET /api/t/[tenantSlug]/risk-matrix-config — Epic 44.
 *
 * Read-mostly endpoint that returns the tenant's effective risk-
 * matrix configuration. Tenants without a stored row resolve to the
 * canonical 5×5 default — `getRiskMatrixConfig` centralises the
 * fallback so the wire format is always fully populated.
 *
 * Read access piggybacks on the standard `risks.view` policy via
 * `getTenantCtx` + `assertCanRead` inside the usecase. Admin write
 * lives at the sibling `/admin/risk-matrix-config` route.
 */

import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import { getRiskMatrixConfig } from '@/app-layer/usecases/risk-matrix-config';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);
        const config = await getRiskMatrixConfig(ctx);
        return jsonResponse(config);
    },
);
