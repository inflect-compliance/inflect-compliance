import { NextRequest } from 'next/server';
import { z } from 'zod';
import { getTenantCtx } from '@/app-layer/context';
import { listVulnerabilities, linkCveToAsset } from '@/app-layer/usecases/vulnerability';
import { withValidatedBody } from '@/lib/validation/route';
import { withApiErrorHandling } from '@/lib/errors/api';
import { jsonResponse } from '@/lib/api-response';

export const GET = withApiErrorHandling(async (req: NextRequest, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const sp = req.nextUrl.searchParams;
    const rows = await listVulnerabilities(ctx, {
        severity: sp.get('severity') ?? undefined,
        status: sp.get('status') ?? undefined,
        assetId: sp.get('assetId') ?? undefined,
    });
    return jsonResponse({ rows });
});

const LinkSchema = z.object({
    assetId: z.string().min(1),
    cveId: z.string().min(1),
    note: z.string().max(20_000).optional().nullable(),
});

export const POST = withApiErrorHandling(withValidatedBody(LinkSchema, async (req, { params: paramsPromise }: { params: Promise<{ tenantSlug: string }> }, body) => {
    const params = await paramsPromise;
    const ctx = await getTenantCtx(params, req);
    const link = await linkCveToAsset(ctx, body);
    return jsonResponse(link, { status: 201 });
}));
