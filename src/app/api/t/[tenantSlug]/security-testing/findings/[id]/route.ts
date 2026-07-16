import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { updateScannerFindingStatus, SCANNER_FINDING_STATUSES } from '@/app-layer/usecases/scanner-ingestion';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

const UpdateSchema = z.object({
    status: z.enum(SCANNER_FINDING_STATUSES),
});

/** Triage a scanner finding — analyst status only (TRIAGED / FALSE_POSITIVE / …). */
export const PATCH = withApiErrorHandling(
    withValidatedBody(
        UpdateSchema,
        async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string; id: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const updated = await updateScannerFindingStatus(ctx, params.id, body.status);
            return jsonResponse(updated);
        },
    ),
);
