import { NextRequest } from 'next/server';

import { getTenantCtx } from '@/app-layer/context';
import {
    ingestReceipt,
    listReceipts,
    ListReceiptsFilterSchema,
} from '@/app-layer/usecases/agent-action-receipt';
import { PipelockReceiptSchema } from '@/lib/mcp/receipt-verification';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

/**
 * POST /api/t/:slug/agent-receipts
 *
 * The pipelock mediator POSTs a signed CORE action receipt here. Authenticated
 * as a machine caller via Bearer TenantApiKey (same M2M path as the MCP surface
 * + the scanner ingest route); the receipt's own Ed25519 signature is then
 * verified inside the usecase before it is trusted / linked to the audit chain.
 * Authorisation is the usecase's `assertCanWrite` + the middleware tenant gate.
 */
export const POST = withApiErrorHandling(
    withValidatedBody(
        PipelockReceiptSchema,
        async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
            const params = await paramsPromise;
            const ctx = await getTenantCtx(params, req);
            const result = await ingestReceipt(ctx, body);
            return jsonResponse(result, { status: 201 });
        },
    ),
);

/**
 * GET /api/t/:slug/agent-receipts
 *
 * List this tenant's agent-action receipts (newest first) for the MCP activity
 * UI. Supports `?verified=true|false`, `?toolName=`, `?limit=`.
 */
export const GET = withApiErrorHandling(
    async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
        const params = await paramsPromise;
        const ctx = await getTenantCtx(params, req);

        const url = new URL(req.url);
        const verifiedParam = url.searchParams.get('verified');
        const limitParam = url.searchParams.get('limit');
        const filter = ListReceiptsFilterSchema.parse({
            verified: verifiedParam === null ? undefined : verifiedParam === 'true',
            toolName: url.searchParams.get('toolName') ?? undefined,
            limit: limitParam ? Number(limitParam) : undefined,
        });

        const receipts = await listReceipts(ctx, filter);
        return jsonResponse({ receipts });
    },
);
