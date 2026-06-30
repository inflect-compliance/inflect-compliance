import { NextRequest } from 'next/server';
import { getTenantCtx } from '@/app-layer/context';
import { ingestScannerRun, IngestScannerRunSchema } from '@/app-layer/usecases/scanner-ingestion';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/:slug/security-testing/ingest
 *
 * The canonical push path — a tenant's CI (GitHub Actions, GitLab CI, …)
 * POSTs a SARIF document here after a scan. Returns the ingest summary
 * (run id, outcome, findings ingested, automated evidence produced,
 * Findings materialised / reconciled). Authorisation is the usecase's
 * `assertCanWrite` + the middleware tenant-access gate.
 */
export const POST = withApiErrorHandling(
    withValidatedBody(
        IngestScannerRunSchema,
        async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await ingestScannerRun(ctx, body);
            return jsonResponse(result, { status: 201 });
        },
    ),
);
